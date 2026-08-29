"""ContactOut person search & enrichment provider (SRS Section 7, API v1)."""

import logging
from typing import Any, Dict, List, Optional

import requests

from .base import ContactEnrichmentProvider, ProviderError, strip_html

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.contactout.com/v1"

MAX_PAGE_SIZE = 25


class ContactOutProvider(ContactEnrichmentProvider):
    """ContactOut People Search + People Enrich connector (token header auth)."""

    def _headers(self) -> Dict[str, str]:
        return {
            "authorization": "basic",
            "token": self._api_key(),
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _base_url(self) -> str:
        return (self.config.base_url or DEFAULT_BASE_URL).rstrip("/")

    def _request(self, method: str, url: str, **kwargs) -> Dict[str, Any]:
        try:
            res = requests.request(method, url, headers=self._headers(), timeout=60, **kwargs)
            res.raise_for_status()
        except requests.RequestException as exc:
            body = ""
            response = getattr(exc, "response", None)
            if response is not None:
                try:
                    body = response.text[:500]
                except Exception:  # noqa: BLE001
                    body = ""
            detail = f" - {body}" if body else ""
            raise ProviderError(f"ContactOut request failed: {exc}{detail}") from exc
        data = res.json()
        self._maybe_capture_credits(data)
        return data

    def _maybe_capture_credits(self, data: Dict[str, Any]) -> None:
        meta = data.get("meta") or data.get("metadata") or {}
        if not isinstance(meta, dict):
            return
        remaining = meta.get("credits_remaining")
        if remaining is None:
            return
        try:
            self.persist_credit_usage({
                "email_remaining": int(remaining),
                "provider": "contactout",
            })
        except Exception:  # noqa: BLE001
            logger.debug("Failed to persist ContactOut credits from response meta", exc_info=True)

    def _page_size(self, fallback: int = 10) -> int:
        size = int(self.config.default_params.get("max_results") or fallback)
        return min(MAX_PAGE_SIZE, max(1, size))

    def fetch_credit_usage(self) -> Dict[str, Any]:
        """GET /v1/stats — email/phone/search remaining credits for the current month."""
        data = self._request("GET", f"{self._base_url()}/stats")
        usage = data.get("usage") or {}
        if not isinstance(usage, dict):
            usage = {}
        return {
            "provider": "contactout",
            "email_remaining": usage.get("remaining", usage.get("quota")),
            "email_quota": usage.get("quota"),
            "email_used": usage.get("count"),
            "phone_remaining": usage.get("phone_remaining", usage.get("phone_quota")),
            "phone_quota": usage.get("phone_quota"),
            "phone_used": usage.get("phone_count"),
            "search_remaining": usage.get("search_remaining", usage.get("search_quota")),
            "search_quota": usage.get("search_quota"),
            "search_used": usage.get("search_count"),
        }

    def search_people(
        self,
        company: str,
        titles: List[str],
        location: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        # Search without reveal_info to conserve email/phone credits on free plans.
        # Contact details are fetched in enrich_person().
        body: Dict[str, Any] = {
            "page": 1,
            "page_size": self._page_size(),
            "company": [company],
            "job_title": [title for title in titles if title],
            "match_experience": "current",
            "detailed_experience": False,
            "detailed_education": False,
            "reveal_info": False,
        }
        if location:
            body["location"] = [location]

        data = self._request(
            "POST",
            f"{self._base_url()}/people/search",
            json=body,
        )
        raw = data.get("profiles") or []
        profiles = raw if isinstance(raw, dict) else {}
        metadata = data.get("metadata") or {}
        logger.info(
            "ContactOut search %s (titles=%s, location=%s): total=%s",
            company,
            body["job_title"],
            location,
            metadata.get("total_results"),
        )
        return [
            self._to_contact(url, person)
            for url, person in profiles.items()
            if isinstance(person, dict)
        ]

    def enrich_person(self, identifiers: Dict[str, Any]) -> Dict[str, Any]:
        needs_email = not identifiers.get("email")
        needs_phone = not identifiers.get("phone")
        if not needs_email and not needs_phone:
            return identifiers
        linkedin_url = identifiers.get("linkedin_url")
        if not linkedin_url:
            return identifiers

        include: List[str] = []
        if needs_email:
            include.extend(["work_email", "personal_email"])
        if needs_phone:
            include.append("phone")
        if not include:
            return identifiers

        try:
            data = self._request(
                "POST",
                f"{self._base_url()}/people/enrich",
                json={
                    "linkedin_url": linkedin_url,
                    "include": include,
                },
            )
        except ProviderError:
            return identifiers
        profile = data.get("profile") or {}
        if not isinstance(profile, dict) or not profile:
            return identifiers
        merged = dict(identifiers)
        for key, value in self._to_contact(linkedin_url, profile).items():
            if value and (not merged.get(key) or key in ("email", "phone", "verification_state")):
                if key == "email" and merged.get("email") and not needs_email:
                    continue
                if key == "phone" and merged.get("phone") and not needs_phone:
                    continue
                merged[key] = value
        # Prefer newly revealed email/phone over empty search stubs.
        enriched = self._to_contact(linkedin_url, profile)
        if needs_email and enriched.get("email"):
            merged["email"] = enriched["email"]
            merged["email_verified"] = enriched.get("email_verified", False)
            merged["verification_state"] = enriched.get("verification_state", "unverified")
        if needs_phone and enriched.get("phone"):
            merged["phone"] = enriched["phone"]
        try:
            self.persist_credit_usage()
        except Exception:  # noqa: BLE001
            logger.debug("Failed to refresh ContactOut credits after enrich", exc_info=True)
        return merged

    def _to_contact(self, linkedin_url: str, person: Dict[str, Any]) -> Dict[str, Any]:
        contact_info = person.get("contact_info") or {}
        if not isinstance(contact_info, dict):
            contact_info = {}
        personal_emails = contact_info.get("personal_emails") or contact_info.get("emails") or []
        if not isinstance(personal_emails, list):
            personal_emails = []
        work_emails = contact_info.get("work_emails") or []
        if not isinstance(work_emails, list):
            work_emails = []
        phones = contact_info.get("phones") or []
        if not isinstance(phones, list):
            phones = []

        # Prefer work email for recruiting outreach.
        email = ""
        for candidate in [*work_emails, *personal_emails]:
            if isinstance(candidate, str) and candidate.strip():
                email = candidate.strip()
                break
        if not email:
            for key in ("work_email", "email", "personal_email"):
                raw = person.get(key)
                if isinstance(raw, list) and raw:
                    email = str(raw[0])
                    break
                if isinstance(raw, str) and raw.strip():
                    email = raw.strip()
                    break

        verified = False
        if email:
            verified = True
            status = person.get("workEmailStatus") or ""
            if isinstance(status, str) and "unverified" in status.lower():
                verified = False
            statuses = contact_info.get("work_email_status")
            if isinstance(statuses, dict) and any(
                "unverified" in str(value).lower() for value in statuses.values()
            ):
                verified = False

        phone = ""
        for item in phones:
            if isinstance(item, str) and item.strip():
                phone = item.strip()
                break
            if isinstance(item, dict):
                raw = item.get("number") or item.get("raw_number") or item.get("phone")
                if raw:
                    phone = str(raw).strip()
                    break
        if not phone:
            raw_phone = person.get("phone")
            if isinstance(raw_phone, list) and raw_phone:
                phone = str(raw_phone[0])
            elif isinstance(raw_phone, str):
                phone = raw_phone

        return {
            "full_name": strip_html(
                person.get("full_name") or person.get("fullName") or ""
            ),
            "job_title": strip_html(
                person.get("title") or person.get("headline") or ""
            ),
            "email": email if isinstance(email, str) else "",
            "phone": phone if isinstance(phone, str) else "",
            "linkedin_url": linkedin_url or person.get("url") or person.get("linkedinUrl") or "",
            "location": strip_html(person.get("location")),
            "email_verified": bool(verified),
            "confidence_score": float(person.get("confidence") or 0.0),
            "verification_state": "verified" if verified else "unverified",
        }

    def health_check(self) -> bool:
        self.persist_credit_usage()
        return True
