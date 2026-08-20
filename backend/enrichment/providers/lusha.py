"""Lusha person search & enrichment provider (API V3, SRS Section 7)."""

import logging
import re
from typing import Any, Dict, List, Optional

import requests

from .base import ContactEnrichmentProvider, ProviderError, strip_html

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.lusha.com/v3"

MIN_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100


class LushaProvider(ContactEnrichmentProvider):
    """Lusha V3 Prospecting + Search-and-Enrich connector (api_key header auth)."""

    def _page_size(self, fallback: int = 25) -> int:
        size = int(self.config.default_params.get("max_results") or fallback)
        return min(MAX_PAGE_SIZE, max(MIN_PAGE_SIZE, size))

    def _headers(self) -> Dict[str, str]:
        return {
            "api_key": self._api_key(),
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
            raise ProviderError(f"Lusha request failed: {exc}{detail}") from exc
        return res.json()

    def _location_filters(self, location: str) -> List[Dict[str, str]]:
        loc = location.strip()
        if len(loc) == 2 and loc.isalpha():
            return [{"countryIso2": loc.upper()}]
        parts = [part.strip() for part in loc.split(",") if part.strip()]
        if len(parts) >= 2:
            entry: Dict[str, str] = {"city": parts[0], "state": parts[1]}
            if len(parts) >= 3:
                entry["country"] = parts[2]
            return [entry]
        return [{"city": loc}, {"country": loc}]

    @staticmethod
    def _company_variants(company: str) -> List[str]:
        variants: List[str] = []
        current = company.strip()
        while current and current not in variants:
            variants.append(current)
            current = re.sub(r"\s+\S+$", "", current).strip()
        return variants

    def _prospecting(
        self,
        company: str,
        titles: List[str],
        location: Optional[str],
    ) -> Dict[str, Any]:
        filters: Dict[str, Any] = {
            "companies": {"include": {"names": [company]}},
            "contacts": {"include": {}},
        }
        title_clauses = [title for title in titles if title]
        if title_clauses:
            filters["contacts"]["include"]["jobTitles"] = title_clauses
        if location:
            filters["contacts"]["include"]["locations"] = self._location_filters(location)

        data = self._request(
            "POST",
            f"{self._base_url()}/contacts/prospecting",
            json={
                "pagination": {"page": 1, "size": self._page_size()},
                "filters": filters,
            },
        )
        pagination = data.get("pagination") or {}
        logger.info(
            "Lusha prospecting %s (titles=%s, location=%s): total=%s, credits=%s",
            company,
            title_clauses,
            location,
            pagination.get("total"),
            (data.get("billing") or {}).get("creditsCharged"),
        )
        return data

    @staticmethod
    def _can_reveal_email(person: Dict[str, Any]) -> bool:
        can_reveal = person.get("canReveal")
        if not isinstance(can_reveal, list) or not can_reveal:
            return True
        return any(
            isinstance(item, dict) and item.get("field") == "emails"
            for item in can_reveal
        )

    def _match(
        self,
        data: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        results = data.get("results") or []
        return [
            self._to_contact(person)
            for person in results
            if isinstance(person, dict)
            and not person.get("error")
            and self._can_reveal_email(person)
        ]

    def search_people(
        self,
        company: str,
        titles: List[str],
        location: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        for variant in self._company_variants(company):
            contacts = self._match(self._prospecting(variant, titles, location))
            if contacts:
                return contacts
            if location:
                logger.warning(
                    "Lusha returned 0 candidates for %r with location %r; retrying without location filter.",
                    variant,
                    location,
                )
                contacts = self._match(self._prospecting(variant, titles, None))
                if contacts:
                    return contacts
        return []

    def enrich_person(self, identifiers: Dict[str, Any]) -> Dict[str, Any]:
        contact_id = identifiers.get("id")
        if not contact_id:
            return identifiers
        data = self._request(
            "POST",
            f"{self._base_url()}/contacts/search-and-enrich",
            json={
                "contacts": [{"id": str(contact_id)}],
                "reveal": ["emails", "phones"],
                "options": {"includePartialProfiles": True},
            },
        )
        results = data.get("results") or []
        for person in results:
            if isinstance(person, dict) and not person.get("error"):
                return self._to_contact(person)
        return identifiers

    def _to_contact(self, person: Dict[str, Any]) -> Dict[str, Any]:
        emails = person.get("emails") or []
        if not isinstance(emails, list):
            emails = []
        phones = person.get("phones") or []
        if not isinstance(phones, list):
            phones = []
        email = emails[0].get("email") if emails and isinstance(emails[0], dict) else ""
        if not isinstance(email, str):
            email = ""
        job_title = person.get("jobTitle") or {}
        if not isinstance(job_title, dict):
            job_title = {"title": str(job_title)}
        location = person.get("location") or {}
        if not isinstance(location, dict):
            location = {}
        social = person.get("socialLinks") or {}
        if not isinstance(social, dict):
            social = {}
        verified = bool(emails) and any(
            str(item.get("confidence", "")).startswith(("A+", "A"))
            for item in emails
            if isinstance(item, dict)
        )
        city = location.get("city") or ""
        country = location.get("country") or ""
        full_name = person.get("fullName") or " ".join(
            part
            for part in (person.get("firstName"), person.get("lastName"))
            if part
        )
        return {
            "id": person.get("id") or "",
            "full_name": strip_html(full_name),
            "job_title": strip_html(job_title.get("title") or ""),
            "email": email,
            "phone": (
                phones[0].get("number")
                if phones and isinstance(phones[0], dict)
                else ""
            ),
            "linkedin_url": social.get("linkedin") or "",
            "location": strip_html(f"{city}, {country}".strip(", ")),
            "email_verified": verified,
            "confidence_score": 0.0,
        }

    def health_check(self) -> bool:
        data = self._request(
            "POST",
            f"{self._base_url()}/contacts/prospecting",
            json={
                "pagination": {"page": 1, "size": MIN_PAGE_SIZE},
                "filters": {"companies": {"include": {"names": ["Google"]}}},
            },
        )
        if not isinstance(data, dict):
            raise ProviderError("Lusha returned an unexpected response.")
        return True