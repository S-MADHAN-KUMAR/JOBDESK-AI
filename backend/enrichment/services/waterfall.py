"""Waterfall orchestrator (Module 3): PDL -> ContactOut -> Apollo -> Lusha with early exit (FR-022)."""

import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from enrichment.models import EnrichmentSource
from enrichment.providers import ProviderError, get_enrichment_provider

logger = logging.getLogger(__name__)

PROVIDER_ORDER = ["pdl", "contactout", "apollo", "lusha"]


class EnrichmentWaterfallOrchestrator:
    """Executes enrichment across providers in sequence and terminates as soon
    as high-confidence verification criteria are satisfied (FR-022, SRS 7)."""

    def __init__(self, sources: List[EnrichmentSource]):
        self.providers: List[Tuple[str, object]] = []
        self.skipped: List[Dict[str, Any]] = []
        available = {source.provider_code: source for source in sources}
        for provider_code in PROVIDER_ORDER:
            source = available.get(provider_code)
            if source is None:
                self.skipped.append({
                    "provider": provider_code,
                    "status": "skipped",
                    "message": "Not configured as an enrichment source.",
                })
                logger.info("Enrichment provider %s SKIPPED: not configured", provider_code)
                continue
            if not source.is_active:
                self.skipped.append({
                    "provider": provider_code,
                    "status": "skipped",
                    "message": "Provider is disabled by an admin.",
                })
                logger.info("Enrichment provider %s SKIPPED: disabled by admin", provider_code)
                continue
            if not source.has_auth_config():
                self.skipped.append({
                    "provider": provider_code,
                    "status": "skipped",
                    "message": "No API credentials configured.",
                })
                logger.info("Enrichment provider %s SKIPPED: no API credentials", provider_code)
                continue
            try:
                self.providers.append((provider_code, get_enrichment_provider(source)))
            except ProviderError as exc:
                self.skipped.append({
                    "provider": provider_code,
                    "status": "skipped",
                    "message": str(exc),
                })
                logger.warning("Enrichment provider %s SKIPPED: %s", provider_code, exc)

    def _is_sufficient(self, contact: Dict[str, Any]) -> bool:
        """Check if target contact fields meet early-exit threshold (FR-022).

        Phone is the highest-priority field: the waterfall only terminates
        early once a contact with BOTH a phone number and a verified email is
        found. Without a phone, all candidates/providers are processed so the
        found data can be stored and backfilled asynchronously.
        """
        has_phone = bool(contact.get("phone"))
        has_email = bool(contact.get("email"))
        is_verified = contact.get("verification_state") == "verified"
        return has_phone and has_email and is_verified

    def enrich_company_contacts(
        self,
        company_name: str,
        target_roles: List[str],
        location: Optional[str] = None,
    ) -> Tuple[List[Dict[str, Any]], List[str], List[Dict[str, Any]]]:
        """Run the waterfall; returns (contacts, providers_used, call_logs)."""
        contacts: List[Dict[str, Any]] = []
        used: List[str] = []
        call_logs: List[Dict[str, Any]] = list(self.skipped)

        for provider_code, provider in self.providers:
            used.append(provider_code)
            entry: Dict[str, Any] = {
                "provider": provider_code,
                "status": "success",
                "message": "",
                "results": 0,
                "contacts": 0,
                "latency_ms": 0,
                "verified": False,
                "candidates": [],
            }
            started = time.perf_counter()
            try:
                logger.info("Enrichment provider %s SEARCHING %s (titles=%s, location=%s)",
                            provider_code, company_name, target_roles, location)
                people = provider.search_people(
                    company=company_name,
                    titles=target_roles,
                    location=location,
                )
            except Exception as exc:  # noqa: BLE001 - fall back to next vendor
                logger.warning("Enrichment provider %s FAILED (search): %s", provider_code, exc)
                entry["status"] = "failed"
                entry["message"] = f"search failed: {exc}"
                entry["latency_ms"] = round((time.perf_counter() - started) * 1000)
                call_logs.append(entry)
                continue

            entry["results"] = len(people)
            entry["message"] = f"search returned {len(people)} candidate(s)"
            entry["candidates"] = [
                person for person in people if isinstance(person, dict)
            ][:50]

            for person in people:
                if not isinstance(person, dict):
                    continue
                try:
                    enriched = provider.enrich_person(person)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Provider %s enrich failed: %s", provider_code, exc)
                    enriched = person
                if not isinstance(enriched, dict):
                    continue
                enriched.setdefault("provider_source", provider_code)
                contacts.append(enriched)
                entry["contacts"] += 1
                if self._is_sufficient(enriched):
                    entry["verified"] = True
                    entry["message"] += (
                        f"; verified contact found, waterfall terminated"
                    )
                    logger.info(
                        "Waterfall target satisfied via %s. Terminating search.",
                        provider_code,
                    )
                    break

            entry["latency_ms"] = round((time.perf_counter() - started) * 1000)
            call_logs.append(entry)
            logger.info(
                "Enrichment provider %s SUCCESS: %s, %s contact(s) enriched, "
                "verified=%s, latency=%sms",
                provider_code,
                entry["message"],
                entry["contacts"],
                entry["verified"],
                entry["latency_ms"],
            )
            if entry["verified"]:
                break
        return contacts, used, call_logs

    def enrich_company_recruiter(
        self,
        company_name: str,
        target_roles: List[str],
    ) -> Optional[Dict[str, Any]]:
        """Spec-compatible: return the first high-confidence contact or None."""
        contacts, _, _ = self.enrich_company_contacts(company_name, target_roles)
        if not contacts:
            return None
        return next(
            (contact for contact in contacts if self._is_sufficient(contact)),
            contacts[0],
        )