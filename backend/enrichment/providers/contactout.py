"""ContactOut person search & enrichment provider (SRS Section 7, API v1)."""

import logging
from typing import Any, Dict, List, Optional

import requests

from .base import ContactEnrichmentProvider, ProviderError, strip_html

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.contactout.com/v1"

MAX_PAGE_SIZE = 50


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
        return res.json()

    def _page_size(self, fallback: int = 25) -> int:
        size = int(self.config.default_params.get("max_results") or fallback)
        return min(MAX_PAGE_SIZE, max(1, size))

    def search_people(
        self,
        company: str,
        titles: List[str],
        location: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        body: Dict[str, Any] = {
            "page": 1,
            "page_size": self._page_size(),
            "company": [company],
            "job_title": [title for title in titles if title],
            "match_experience": "current",
            "detailed_experience": False,
            "detailed_education": False,
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
        if identifiers.get("email"):
            return identifiers
        linkedin_url = identifiers.get("linkedin_url")
        if not linkedin_url:
            return identifiers
        try:
            data = self._request(
                "POST",
                f"{self._base_url()}/people/enrich",
                json={
                    "linkedin_url": linkedin_url,
                    "include": ["work_email", "personal_email", "phone"],
                },
            )
        except ProviderError:
            return identifiers
        profile = data.get("profile") or {}
        if not isinstance(profile, dict) or not profile:
            return identifiers
        merged = dict(identifiers)
        for key, value in self._to_contact(linkedin_url, profile).items():
            if value:
                merged[key] = value
        return merged

    def _to_contact(self, linkedin_url: str, person: Dict[str, Any]) -> Dict[str, Any]:
        contact_info = person.get("contact_info") or {}
        if not isinstance(contact_info, dict):
            contact_info = {}
        emails = contact_info.get("personal_emails") or contact_info.get("emails") or []
        if not isinstance(emails, list):
            emails = []
        work_emails = contact_info.get("work_emails") or []
        if not isinstance(work_emails, list):
            work_emails = []
        phones = contact_info.get("phones") or []
        if not isinstance(phones, list):
            phones = []

        email = (emails + work_emails)[0] if (emails + work_emails) else ""
        if not email:
            for key in ("email", "work_email", "personal_email"):
                raw = person.get(key)
                if isinstance(raw, list) and raw:
                    email = raw[0]
                    break
                if isinstance(raw, str) and raw:
                    email = raw
                    break
        if not isinstance(email, str):
            email = ""

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

        phone = phones[0] if phones else ""
        if not phone:
            raw_phone = person.get("phone")
            if isinstance(raw_phone, list) and raw_phone:
                phone = raw_phone[0]
            elif isinstance(raw_phone, str):
                phone = raw_phone
        if not isinstance(phone, str):
            phone = ""

        return {
            "full_name": strip_html(
                person.get("full_name") or person.get("fullName") or ""
            ),
            "job_title": strip_html(
                person.get("title") or person.get("headline") or ""
            ),
            "email": email,
            "phone": phone,
            "linkedin_url": linkedin_url or person.get("url") or person.get("linkedinUrl") or "",
            "location": strip_html(person.get("location")),
            "email_verified": bool(verified),
            "confidence_score": float(person.get("confidence") or 0.0),
        }

    def health_check(self) -> bool:
        data = self._request(
            "POST",
            f"{self._base_url()}/people/search",
            json={"page": 1, "page_size": 10, "company": ["ZZZNoSuchCompanyXYZ123"]},
        )
        if not isinstance(data, dict):
            raise ProviderError("ContactOut returned an unexpected response.")
        return True