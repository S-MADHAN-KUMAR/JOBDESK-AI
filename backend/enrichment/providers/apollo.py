"""Apollo.io people search + enrichment provider (SRS Section 7).

Apollo splits prospecting across two endpoints:

  - ``POST /mixed_people/api_search``  search, 0 credits, never returns
    email or phone (last names come back obfuscated on lower plans).
  - ``POST /people/match``             enrichment, costs credits, returns
    email plus (asynchronously) phone.

Emails only appear when ``reveal_personal_emails=true`` AND the account still
has credits. Phone numbers are never returned synchronously: ``reveal_phone_number``
requires a ``webhook_url`` and costs ~8 direct-dial credits per number, so this
provider only asks for a phone when Apollo's search flagged the person as having
one and the account still has dial credits. Results are picked up from Apollo's
webhook-result store (``GET /webhook_result/{request_id}``).
"""

import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

from .base import ContactEnrichmentProvider, ProviderError, strip_html

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.apollo.io/api/v1"

MAX_PAGE_SIZE = 100
MAX_TITLES = 10

SEARCH_URL = "/mixed_people/api_search"
ENRICH_URL = "/people/match"
PROFILE_URL = "/users/api_profile"
CREDIT_STATS_URL = "/usage_stats/credit_usage_stats"
WEBHOOK_RESULT_URL = "/webhook_result/{request_id}"

PHONE_POLL_MAX_ATTEMPTS = 6
PHONE_POLL_WAIT_SECONDS = 5

# Apollo returns this sentinel instead of a real address when the account has
# not unlocked (or cannot afford) the contact.
EMAIL_PLACEHOLDER_MARKERS = (
    "email_not_unlocked",
    "not_unlocked",
    "domain.com",
)


def _is_placeholder_email(email: str) -> bool:
    if not email or "@" not in email:
        return True
    lowered = email.lower()
    return any(marker in lowered for marker in EMAIL_PLACEHOLDER_MARKERS)


class ApolloProvider(ContactEnrichmentProvider):
    """Apollo People API Search + Enrichment connector (X-Api-Key auth)."""

    def __init__(self, source_config):
        super().__init__(source_config)
        self._credits_cache: Optional[Dict[str, Any]] = None

    # ------------------------------------------------------------------
    # HTTP plumbing
    # ------------------------------------------------------------------

    def _headers(self) -> Dict[str, str]:
        return {
            "X-Api-Key": self._api_key(),
            "Content-Type": "application/json",
            "accept": "application/json",
        }

    def _base_url(self) -> str:
        base = (self.config.base_url or DEFAULT_BASE_URL).rstrip("/")
        # Older configs stored https://api.apollo.io/v1, which 404s on every
        # current endpoint. Normalise it rather than failing every call.
        if base.endswith("apollo.io/v1"):
            base = base.replace("apollo.io/v1", "apollo.io/api/v1")
        return base

    def _send(self, method: str, url: str, **kwargs) -> Tuple[int, Dict[str, Any]]:
        """Perform a request and always return (status_code, parsed_body)."""
        try:
            res = requests.request(method, url, headers=self._headers(), timeout=60, **kwargs)
        except requests.RequestException as exc:
            raise ProviderError(f"Apollo request failed: {exc}") from exc
        try:
            body = res.json()
        except ValueError:
            body = {}
        if not isinstance(body, dict):
            body = {"data": body}
        return res.status_code, body

    @staticmethod
    def _error_message(status_code: int, body: Dict[str, Any]) -> str:
        for key in ("error", "message", "error_message"):
            value = body.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
            if isinstance(value, dict):
                nested = value.get("message")
                if isinstance(nested, str) and nested.strip():
                    return nested.strip()
        errors = body.get("errors")
        if isinstance(errors, list) and errors:
            return "; ".join(str(item) for item in errors[:3])
        return f"HTTP {status_code}"

    def _request(self, method: str, url: str, **kwargs) -> Dict[str, Any]:
        status_code, body = self._send(method, url, **kwargs)
        if status_code >= 400:
            raise ProviderError(f"Apollo {self._error_message(status_code, body)}")
        return body

    # ------------------------------------------------------------------
    # Account credits
    # ------------------------------------------------------------------

    def _page_size(self, fallback: int = 25) -> int:
        size = int(self.config.default_params.get("max_results") or fallback)
        return min(MAX_PAGE_SIZE, max(1, size))

    def _webhook_url(self) -> str:
        url = self.config.default_params.get("webhook_url")
        if not url or not str(url).strip():
            return ""
        return str(url).strip()

    def _credits(self) -> Dict[str, Any]:
        """Cached per-instance snapshot of the account's credit balances."""
        if self._credits_cache is None:
            try:
                self._credits_cache = self.fetch_credit_usage()
            except ProviderError as exc:
                logger.warning("Apollo credit lookup failed: %s", exc)
                self._credits_cache = {}
        return self._credits_cache

    @staticmethod
    def _as_int(value: Any) -> Optional[int]:
        if value in (None, ""):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _has_email_credits(self) -> bool:
        remaining = self._as_int(self._credits().get("email_remaining"))
        return remaining is None or remaining > 0

    def _has_phone_credits(self) -> bool:
        credits = self._credits()
        remaining = self._as_int(credits.get("phone_remaining"))
        if remaining is not None and remaining > 0:
            return True
        # Unified-credit plans report a 0 dial quota; mobile reveals spend
        # from the shared lead/email pool instead.
        quota = self._as_int(credits.get("phone_quota"))
        if quota in (0, None):
            return self._has_email_credits()
        return False

    def _credit_summary(self) -> str:
        credits = self._credits()
        remaining = self._as_int(credits.get("email_remaining"))
        quota = self._as_int(credits.get("email_quota"))
        if remaining is None and quota is None:
            return ""
        if quota is None:
            return f"{remaining} email credit(s) remaining"
        return f"{remaining if remaining is not None else 0} of {quota} email credit(s) remaining"

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search_people(
        self,
        company: str,
        titles: List[str],
        location: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        clean_titles = [title.strip() for title in titles if title and title.strip()]
        params: Dict[str, Any] = {
            "page": 1,
            "per_page": self._page_size(),
            "include_similar_titles": "true",
        }
        if clean_titles:
            params["person_titles[]"] = clean_titles[:MAX_TITLES]

        domain = self._company_domain(company)
        if domain:
            params["q_organization_domains_list[]"] = [domain]
        else:
            # Without a domain, keyword matching on the employer name is the
            # only lever Apollo exposes on the search endpoint.
            params["q_organization_keyword_tags[]"] = [company]
            params["q_keywords"] = company
        if location:
            params["person_locations[]"] = [location]

        # Search is free; refresh leftover so the UI and enrich guards stay current.
        try:
            self.persist_credit_usage()
        except Exception:  # noqa: BLE001
            logger.debug("Failed to refresh Apollo credits before search", exc_info=True)

        data = self._request("POST", f"{self._base_url()}{SEARCH_URL}", params=params)
        payload = data.get("data") if isinstance(data.get("data"), dict) else data
        raw = payload.get("people") or []
        contacts = [
            self._to_contact(person, company=company)
            for person in raw
            if isinstance(person, dict)
        ]
        logger.info(
            "Apollo search %s (titles=%s, domain=%s): %s candidate(s)",
            company,
            clean_titles,
            domain or "-",
            len(contacts),
        )
        return contacts

    def _company_domain(self, company: str) -> str:
        """Resolve a company domain from config overrides or the name itself."""
        overrides = self.config.default_params.get("company_domains") or {}
        if isinstance(overrides, dict):
            mapped = overrides.get(company) or overrides.get(company.lower())
            if mapped:
                return str(mapped).strip().lstrip("@").replace("www.", "")
        candidate = (company or "").strip()
        if "." in candidate and " " not in candidate:
            return candidate.lstrip("@").replace("www.", "")
        return ""

    # ------------------------------------------------------------------
    # Enrichment
    # ------------------------------------------------------------------

    def enrich_person(self, identifiers: Dict[str, Any]) -> Dict[str, Any]:
        needs_email = _is_placeholder_email(str(identifiers.get("email") or ""))
        needs_phone = not identifiers.get("phone")
        if not needs_email and not needs_phone:
            return identifiers

        match_params = self._match_identifiers(identifiers)
        if not match_params:
            merged = dict(identifiers)
            merged["enrichment_error"] = "No Apollo identifiers available for this person."
            return merged

        merged = dict(identifiers)

        if needs_email and not self._has_email_credits():
            summary = self._credit_summary()
            merged["enrichment_error"] = (
                "Apollo has no email credits remaining, so email could not be revealed"
                + (f" ({summary})." if summary else ".")
            )
            return merged

        params: Dict[str, Any] = dict(match_params)
        params["reveal_personal_emails"] = "true" if needs_email else "false"

        webhook_url = self._webhook_url()
        # Direct dials cost ~8 credits each. Only spend them when Apollo's own
        # search says a number exists and the plan can still afford one.
        request_phone = bool(
            needs_phone
            and webhook_url
            and identifiers.get("has_direct_phone")
            and self._has_phone_credits()
        )
        if request_phone:
            params["reveal_phone_number"] = "true"
            params["webhook_url"] = webhook_url

        status_code, body = self._send(
            "POST", f"{self._base_url()}{ENRICH_URL}", params=params
        )
        if status_code >= 400:
            reason = self._error_message(status_code, body)
            logger.warning("Apollo enrich failed for %s: %s", match_params, reason)
            merged["enrichment_error"] = f"Apollo enrichment failed: {reason}"
            return merged

        person = body.get("person") or {}
        if isinstance(person, dict) and person:
            enriched = self._to_contact(person)
            if needs_email and enriched.get("email"):
                merged["email"] = enriched["email"]
                merged["email_verified"] = enriched.get("email_verified", False)
                merged["verification_state"] = enriched.get("verification_state", "unverified")
            if enriched.get("phone"):
                merged["phone"] = enriched["phone"]
            for key in ("full_name", "job_title", "linkedin_url", "location", "confidence_score"):
                if enriched.get(key) and not merged.get(key):
                    merged[key] = enriched[key]
        else:
            merged.setdefault(
                "enrichment_error",
                "Apollo matched no record for this person.",
            )

        request_id = body.get("request_id")
        if request_phone and request_id is not None:
            phone_numbers = self._poll_phone_numbers(request_id, attempts=3)
            if phone_numbers:
                merged["phone"] = phone_numbers[0]
            elif not merged.get("phone"):
                merged["apollo_request_id"] = request_id
                merged["apollo_person_id"] = match_params.get("id", "")

        if needs_email and _is_placeholder_email(str(merged.get("email") or "")):
            merged["email"] = ""
            merged.setdefault(
                "enrichment_error",
                "Apollo has no unlocked email for this person.",
            )

        # Balances change after every reveal; refresh so the UI stays accurate.
        self._credits_cache = None
        try:
            self.persist_credit_usage()
        except Exception:  # noqa: BLE001
            logger.debug("Failed to refresh Apollo credits after enrich", exc_info=True)
        return merged

    @staticmethod
    def _match_identifiers(identifiers: Dict[str, Any]) -> Dict[str, Any]:
        """Build the richest identifier set Apollo will accept for a match.

        Apollo matches far more reliably with name + domain than with an ID
        alone, and search results on lower plans obfuscate the last name.
        """
        params: Dict[str, Any] = {}
        person_id = identifiers.get("id")
        if person_id:
            params["id"] = str(person_id)

        first_name = str(identifiers.get("first_name") or "").strip()
        last_name = str(identifiers.get("last_name") or "").strip()
        full_name = str(identifiers.get("full_name") or "").strip()
        if first_name:
            params["first_name"] = first_name
        if last_name:
            params["last_name"] = last_name
        if full_name and not (first_name and last_name):
            params["name"] = full_name

        domain = str(identifiers.get("company_domain") or "").strip()
        if domain:
            params["domain"] = domain
        organization = str(identifiers.get("company_name") or "").strip()
        if organization:
            params["organization_name"] = organization

        linkedin_url = str(identifiers.get("linkedin_url") or "").strip()
        if linkedin_url:
            params["linkedin_url"] = linkedin_url

        email = str(identifiers.get("email") or "").strip()
        if email and not _is_placeholder_email(email):
            params["email"] = email

        return params

    # ------------------------------------------------------------------
    # Credits / health
    # ------------------------------------------------------------------

    @staticmethod
    def _credit_bucket(stats: Dict[str, Any], key: str) -> Dict[str, Optional[int]]:
        raw = (stats.get("credit_usage_stats") or {}).get(key) or {}
        if not isinstance(raw, dict):
            raw = {}
        remaining = raw.get("left_over")
        limit = raw.get("limit")
        consumed = raw.get("consumed")
        if remaining is None and limit is not None and consumed is not None:
            try:
                remaining = int(limit) - int(consumed)
            except (TypeError, ValueError):
                remaining = None
        return {
            "remaining": remaining if remaining is None else max(0, int(remaining)),
            "quota": None if limit is None else max(0, int(limit)),
            "used": None if consumed is None else max(0, int(consumed)),
        }

    def _credits_from_team_stats(self) -> Dict[str, Any]:
        """POST /usage_stats/credit_usage_stats — team leftover this cycle."""
        data = self._request("POST", f"{self._base_url()}{CREDIT_STATS_URL}")
        lead = self._credit_bucket(data, "lead_credit")
        dial = self._credit_bucket(data, "direct_dial_credit")
        export = self._credit_bucket(data, "export_credit")
        cycle = data.get("current_credit_cycle") or {}
        return {
            "provider": "apollo",
            "email_remaining": lead["remaining"],
            "email_quota": lead["quota"],
            "email_used": lead["used"],
            "phone_remaining": dial["remaining"],
            "phone_quota": dial["quota"],
            "phone_used": dial["used"],
            "export_remaining": export["remaining"],
            "export_quota": export["quota"],
            "export_used": export["used"],
            "cycle_start": cycle.get("start_date"),
            "cycle_end": cycle.get("end_date"),
            "credit_source": "team_stats",
        }

    def _credits_from_user_profile(self) -> Dict[str, Any]:
        """GET /users/api_profile?include_credit_usage=true — per-user fallback."""
        data = self._request(
            "GET",
            f"{self._base_url()}{PROFILE_URL}",
            params={"include_credit_usage": "true"},
        )
        lead_quota = self._as_int(data.get("effective_num_lead_credits"))
        lead_used = self._as_int(data.get("num_lead_credits_used"))
        lead_remaining = self._as_int(data.get("num_credits_remaining"))
        if lead_remaining is None and lead_quota is not None and lead_used is not None:
            lead_remaining = max(0, lead_quota - lead_used)

        dial_quota = self._as_int(data.get("effective_num_direct_dial_credits"))
        dial_used = self._as_int(data.get("num_direct_dial_credits_used"))
        dial_remaining = None
        if dial_quota is not None:
            dial_remaining = max(0, dial_quota - (dial_used or 0))

        export_quota = self._as_int(data.get("effective_num_export_credits"))
        export_used = self._as_int(data.get("num_export_credits_used"))
        export_remaining = None
        if export_quota is not None:
            export_remaining = max(0, export_quota - (export_used or 0))

        return {
            "provider": "apollo",
            "email_remaining": lead_remaining,
            "email_quota": lead_quota,
            "email_used": lead_used,
            "phone_remaining": dial_remaining,
            "phone_quota": dial_quota,
            "phone_used": dial_used,
            "export_remaining": export_remaining,
            "export_quota": export_quota,
            "export_used": export_used,
            "credit_source": "user_profile",
        }

    def fetch_credit_usage(self) -> Dict[str, Any]:
        """Team leftover is the balance that actually gates email/phone reveals.

        ``/users/api_profile`` reports the *user's* allowance (e.g. 75) and
        can show 0 remaining even when ``num_lead_credits_used`` is 0, or a
        leftover that does not match the team pool. Apollo's documented
        source of truth is ``POST /usage_stats/credit_usage_stats``.
        """
        try:
            usage = self._credits_from_team_stats()
        except ProviderError as exc:
            logger.warning("Apollo team credit stats unavailable (%s); using profile", exc)
            usage = self._credits_from_user_profile()
        self._credits_cache = usage
        return usage

    def health_check(self) -> bool:
        usage = self.persist_credit_usage()
        remaining = self._as_int(usage.get("email_remaining"))
        if remaining is not None and remaining <= 0:
            quota = self._as_int(usage.get("email_quota"))
            detail = (
                f"0 of {quota} email credits remaining this cycle"
                if quota is not None
                else "0 email credits remaining"
            )
            raise ProviderError(
                f"Apollo credentials are valid but {detail}, "
                "so no emails or phone numbers can be revealed."
            )
        return True

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
                try:
                    payload = res.json()
                except ValueError:
                    break
                result = (payload.get("webhook_result") or {}).get("people") or []
                for entry in result:
                    if not isinstance(entry, dict):
                        continue
                    for phone in entry.get("phone_numbers") or []:
                        if isinstance(phone, dict):
                            number = phone.get("raw_number") or phone.get("sanitized_number")
                            if number:
                                numbers.append(str(number))
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

    # ------------------------------------------------------------------
    # Response mapping
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_email(person: Dict[str, Any]) -> Tuple[str, str]:
        """Return (email, status) from any of Apollo's email carriers."""
        candidates: List[Tuple[str, str]] = []

        direct = person.get("email")
        if isinstance(direct, str) and direct:
            candidates.append((direct, str(person.get("email_status") or "")))

        for key in ("contact_emails", "personal_emails"):
            values = person.get(key)
            if not isinstance(values, list):
                continue
            for item in values:
                if isinstance(item, str) and item:
                    candidates.append((item, ""))
                elif isinstance(item, dict) and item.get("email"):
                    candidates.append(
                        (str(item["email"]), str(item.get("email_status") or ""))
                    )

        contact = person.get("contact")
        if isinstance(contact, dict):
            nested = contact.get("email")
            if isinstance(nested, str) and nested:
                candidates.append((nested, str(contact.get("email_status") or "")))

        for email, email_status in candidates:
            cleaned = email.strip()
            if not _is_placeholder_email(cleaned):
                return cleaned, email_status
        return "", ""

    @staticmethod
    def _extract_phone(person: Dict[str, Any]) -> str:
        def from_list(values: Any) -> str:
            if not isinstance(values, list):
                return ""
            for item in values:
                if isinstance(item, dict):
                    number = item.get("raw_number") or item.get("sanitized_number")
                    if number:
                        return str(number)
                elif isinstance(item, str) and item:
                    return item
            return ""

        number = from_list(person.get("phone_numbers"))
        if number:
            return number

        sanitized = person.get("sanitized_phone")
        if sanitized:
            return str(sanitized)

        contact = person.get("contact")
        if isinstance(contact, dict):
            number = from_list(contact.get("phone_numbers"))
            if number:
                return number
            if contact.get("sanitized_phone"):
                return str(contact["sanitized_phone"])

        raw = person.get("phone")
        return raw if isinstance(raw, str) else ""

    def _to_contact(
        self,
        person: Dict[str, Any],
        company: str = "",
    ) -> Dict[str, Any]:
        email, email_status = self._extract_email(person)
        verified = email_status.lower() in ("verified", "valid")
        phone = self._extract_phone(person)

        first_name = str(person.get("first_name") or "").strip()
        # Search results obfuscate the surname ("Do***t") on lower plans; a
        # masked value is worse than nothing when we pass it back for matching.
        last_name = str(person.get("last_name") or "").strip()
        if "*" in last_name:
            last_name = ""
        name = (
            person.get("name")
            or person.get("full_name")
            or " ".join(part for part in (first_name, last_name) if part)
        )

        organization = person.get("organization")
        if not isinstance(organization, dict):
            organization = {}
        company_name = str(organization.get("name") or company or "").strip()
        company_domain = str(
            organization.get("primary_domain")
            or organization.get("domain")
            or ""
        ).strip()

        return {
            "id": person.get("id") or "",
            "first_name": first_name,
            "last_name": last_name,
            "full_name": strip_html(name),
            "job_title": strip_html(person.get("title") or person.get("job_title")),
            "email": email,
            "phone": phone,
            "linkedin_url": person.get("linkedin_url") or "",
            "location": strip_html(
                person.get("city") or person.get("location") or ""
            ),
            "company_name": company_name,
            "company_domain": company_domain,
            "has_email": bool(person.get("has_email")),
            "has_direct_phone": bool(person.get("has_direct_phone")),
            "email_verified": bool(verified),
            "confidence_score": float(person.get("confidence_score") or 0.0),
            "verification_state": "verified" if verified else "unverified",
        }
