"""People Data Labs (PDL) person enrichment provider (SRS Section 7)."""

from typing import Any, Dict, List, Optional

import requests

from .base import ContactEnrichmentProvider, ProviderError, strip_html

DEFAULT_BASE_URL = "https://sandbox.api.peopledatalabs.com/v5"

class PeopleDataLabsProvider(ContactEnrichmentProvider):
    """PeopleDataLabs Person Search / Enrichment connector."""

    def _headers(self) -> Dict[str, str]:
        return {
            "X-Api-Key": self._api_key(),
            "Content-Type": "application/json",
        }

    def _base_url(self) -> str:
        return (self.config.base_url or DEFAULT_BASE_URL).rstrip("/")

    def _request(self, method: str, url: str, **kwargs) -> Dict[str, Any]:
        try:
            res = requests.request(method, url, headers=self._headers(), timeout=60, **kwargs)
            res.raise_for_status()
        except requests.RequestException as exc:
            raise ProviderError(f"PeopleDataLabs request failed: {exc}") from exc
        return res.json()

    def search_people(
        self,
        company: str,
        titles: List[str],
        location: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        must: List[Dict[str, Any]] = [{"term": {"job_company_name": company}}]
        title_clauses = [{"match": {"job_title.text": title}} for title in titles if title]
        if title_clauses:
            must.append({"bool": {"should": title_clauses}})
        if location:
            must.append({"match": {"location_name": location}})

        data = self._request(
            "POST",
            f"{self._base_url()}/person/search",
            json={
                "query": {"bool": {"must": must}},
                "size": int(self.config.default_params.get("max_results") or 25),
            },
        )
        return [self._to_contact(person) for person in (data.get("data") or [])]

    def enrich_person(self, identifiers: Dict[str, Any]) -> Dict[str, Any]:
        params: Dict[str, str] = {}
        if identifiers.get("email"):
            params["email"] = identifiers["email"]
        elif identifiers.get("linkedin_url"):
            params["linkedin_url"] = identifiers["linkedin_url"]
        elif identifiers.get("id") and str(identifiers.get("id")).isdigit():
            params["id"] = str(identifiers["id"])

        if params:
            try:
                data = self._request("GET", f"{self._base_url()}/person/enrich", params=params)
                if data.get("status") == 200 and data.get("data"):
                    return self._to_contact(data["data"])
            except ProviderError:
                pass
        return identifiers

    def _to_contact(self, person: Dict[str, Any]) -> Dict[str, Any]:
        phones = person.get("phone_numbers") or []
        if not isinstance(phones, list):
            phones = []
        emails = person.get("personal_emails") or []
        if not isinstance(emails, list):
            raw_emails = person.get("emails") or []
            emails = [
                item.get("address")
                for item in (raw_emails if isinstance(raw_emails, list) else [])
                if isinstance(item, dict) and item.get("address")
            ]
        email = person.get("recommended_personal_email") or (emails[0] if emails else "")
        if not isinstance(email, str):
            email = ""
        verification = person.get("email_verification") or {}
        verified = verification.get("status") in ("valid", "accept_all")
        location = person.get("location_name") or ""
        if not isinstance(location, str):
            location = ""
        return {
            "full_name": strip_html(person.get("full_name")),
            "job_title": strip_html(person.get("job_title")),
            "email": email,
            "phone": phones[0].get("phone_number") if phones else "",
            "linkedin_url": person.get("linkedin_url") or "",
            "location": strip_html(location),
            "email_verified": bool(verified),
            "confidence_score": float(person.get("confidence") or 0.0),
        }

    def health_check(self) -> bool:
        data = self._request(
            "POST",
            f"{self._base_url()}/person/search",
            json={"query": {"bool": {"must": [{"term": {"job_company_name": "Google"}}]}}, "size": 1},
        )
        if not isinstance(data, dict):
            raise ProviderError("PeopleDataLabs returned an unexpected response.")
        return True