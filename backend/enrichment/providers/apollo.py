"""Apollo.io people search provider (SRS Section 7).

Uses Apollo's current, non-deprecated endpoints (the legacy
``/mixed_people/search`` endpoint was retired and now returns 422):

  - POST /mixed_people/api_search  -> search, returns partial profiles
  - POST /people/match             -> enrich a profile by Apollo ID

The search endpoint no longer returns email/phone data, so found profiles
are enriched via the People Enrichment endpoint (``reveal_personal_emails``).

Phone numbers are never returned synchronously by Apollo: ``reveal_phone_number``
requires a ``webhook_url`` and the numbers are delivered asynchronously. When a
``webhook_url`` is configured in the source's ``default_params``, this provider
requests phone reveal and polls Apollo's webhook-result store
(``/webhook_result/{request_id}``) to merge them into the contact. If no
``webhook_url`` is configured, only email is enriched.
"""

import time
from typing import Any, Dict, List, Optional

import requests

from .base import ContactEnrichmentProvider, ProviderError, strip_html

DEFAULT_BASE_URL = "https://api.apollo.io/v1"

MAX_PAGE_SIZE = 100
MAX_TITLES = 10

SEARCH_URL = "/mixed_people/api_search"
ENRICH_URL = "/people/match"
WEBHOOK_RESULT_URL = "/webhook_result/{request_id}"

PHONE_POLL_MAX_ATTEMPTS = 6
PHONE_POLL_WAIT_SECONDS = 5


class ApolloProvider(ContactEnrichmentProvider):
    """Apollo People API Search + Enrichment connector (X-Api-Key auth)."""

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
            detail = ""
            if exc.response is not None and exc.response.text:
                detail = f": {exc.response.text[:500]}"
            raise ProviderError(f"Apollo request failed: {exc}{detail}") from exc
        return res.json()

    def _page_size(self, fallback: int = 25) -> int:
        size = int(self.config.default_params.get("max_results") or fallback)
        return min(MAX_PAGE_SIZE, max(1, size))

    def _webhook_url(self) -> str:
        url = self.config.default_params.get("webhook_url")
        if not url or not str(url).strip():
            return ""
        return str(url).strip()

    def search_people(
        self,
        company: str,
        titles: List[str],
        location: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        body: Dict[str, Any] = {
            "q_keywords": company,
            "person_titles": [title for title in titles if title][:MAX_TITLES],
            "page": 1,
            "per_page": self._page_size(),
        }
        if location:
            body["person_locations"] = [location]

        data = self._request(
            "POST",
            f"{self._base_url()}{SEARCH_URL}",
            json=body,
        )
        payload = data.get("data") or data
        raw = payload.get("people") or []
        return [
            self._to_contact(person)
            for person in raw
            if isinstance(person, dict)
        ]

    def enrich_person(self, identifiers: Dict[str, Any]) -> Dict[str, Any]:
        if identifiers.get("email"):
            return identifiers
        person_id = identifiers.get("id")
        if not person_id:
            return identifiers
        params: Dict[str, Any] = {
            "id": person_id,
            "reveal_personal_emails": "true",
        }
        webhook_url = self._webhook_url()
        if webhook_url:
            params["reveal_phone_number"] = "true"
            params["webhook_url"] = webhook_url
        try:
            data = self._request(
                "POST",
                f"{self._base_url()}{ENRICH_URL}",
                params=params,
                json={},
            )
        except ProviderError:
            return identifiers
        person = data.get("person") or {}
        merged = dict(identifiers)
        if isinstance(person, dict) and person:
            for key, value in self._to_contact(person).items():
                if value:
                    merged[key] = value
        if webhook_url and data.get("request_id") is not None:
            request_id = data["request_id"]
            phone_numbers = self._poll_phone_numbers(request_id, attempts=1)
            if phone_numbers:
                merged["phone"] = phone_numbers[0]
            else:
                merged["apollo_request_id"] = request_id
                merged["apollo_person_id"] = person_id
        return merged

    def fetch_phone_by_request_id(self, request_id: Any) -> str:
        """Single-attempt fetch of a revealed phone for a pending request.

        Used by the background poller / management command to backfill phone
        numbers that had not arrived during the synchronous run.
        """
        numbers = self._poll_phone_numbers(request_id, attempts=1)
        return numbers[0] if numbers else ""

    def _poll_phone_numbers(
        self,
        request_id: Any,
        attempts: int = PHONE_POLL_MAX_ATTEMPTS,
    ) -> List[str]:
        """Poll Apollo's webhook-result store for async phone reveal data.

        Apollo keeps webhook results for 30 days; polling works even when the
        configured webhook URL is unreachable. Returns raw phone numbers.
        """
        numbers: List[str] = []
        url = f"{self._base_url()}{WEBHOOK_RESULT_URL.format(request_id=request_id)}"
        for attempt in range(attempts):
            try:
                res = requests.get(url, headers=self._headers(), timeout=10)
            except requests.RequestException:
                break
            if res.status_code == 200:
                payload = res.json()
                result = (payload.get("webhook_result") or {}).get("people") or []
                for entry in result:
                    if not isinstance(entry, dict):
                        continue
                    for phone in entry.get("phone_numbers") or []:
                        if isinstance(phone, dict) and phone.get("raw_number"):
                            numbers.append(phone["raw_number"])
                return numbers
            if res.status_code == 404:
                if attempt < attempts - 1:
                    wait = PHONE_POLL_WAIT_SECONDS
                    try:
                        body = res.json()
                        wait = int(body.get("retry_after_seconds") or wait)
                    except (ValueError, TypeError):
                        wait = PHONE_POLL_WAIT_SECONDS
                    time.sleep(max(1, min(wait, 15)))
                continue
            break
        return numbers

    @staticmethod
    def _extract_phone(person: Dict[str, Any]) -> str:
        raw = person.get("phone_numbers")
        if isinstance(raw, list):
            for item in raw:
                if isinstance(item, dict) and item.get("raw_number"):
                    return item["raw_number"]
                if isinstance(item, str) and item:
                    return item
        contact = person.get("contact")
        if isinstance(contact, dict):
            raw = contact.get("phone_numbers")
            if isinstance(raw, list):
                for item in raw:
                    if isinstance(item, dict) and item.get("raw_number"):
                        return item["raw_number"]
                    if isinstance(item, str) and item:
                        return item
            sanitized = contact.get("sanitized_phone")
            if sanitized:
                return str(sanitized)
        raw = person.get("phone")
        return raw if isinstance(raw, str) else ""

    def _to_contact(self, person: Dict[str, Any]) -> Dict[str, Any]:
        email = person.get("email") or ""
        if not isinstance(email, str):
            email = ""
        email_status = person.get("email_status") or ""
        verified = email_status in ("verified", "valid")

        phone = self._extract_phone(person)

        first_name = person.get("first_name") or ""
        last_name = person.get("last_name") or ""
        name = (
            person.get("name")
            or person.get("full_name")
            or " ".join(part for part in (first_name, last_name) if part)
        )

        return {
            "id": person.get("id") or "",
            "full_name": strip_html(name),
            "job_title": strip_html(person.get("title") or person.get("job_title")),
            "email": email,
            "phone": phone,
            "linkedin_url": person.get("linkedin_url") or "",
            "location": strip_html(
                person.get("city") or person.get("location") or ""
            ),
            "email_verified": bool(verified),
            "confidence_score": float(person.get("confidence_score") or 0.0),
            "verification_state": "verified" if verified else "unverified",
        }

    def health_check(self) -> bool:
        data = self._request(
            "POST",
            f"{self._base_url()}{SEARCH_URL}",
            json={
                "q_keywords": "Google",
                "person_titles": ["Recruiter"],
                "page": 1,
                "per_page": 1,
            },
        )
        if not isinstance(data, dict):
            raise ProviderError("Apollo returned an unexpected response.")
        return True