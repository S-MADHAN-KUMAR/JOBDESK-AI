"""Contact data & provenance manager (Module 4): persist enriched records with audit tracking."""

from typing import Any, Dict

from django.utils import timezone

from enrichment.models import Company, Contact

ROLE_CATEGORIES = (
    ("talent", "Talent Acquisition"),
    ("recruiter", "Technical Recruiter"),
    ("hr", "HR / People Ops"),
    ("people", "HR / People Ops"),
    ("sourcer", "Sourcer"),
)


class ContactProvenanceManager:
    """Normalizes and persists enriched contacts with full provenance."""

    @staticmethod
    def normalize_role(raw_role: str) -> str:
        """Normalize raw title into standard categories."""
        role_lower = (raw_role or "").lower()
        for keyword, category in ROLE_CATEGORIES:
            if keyword in role_lower:
                return category
        return raw_role

    @staticmethod
    def _verification_state(payload: Dict[str, Any]) -> str:
        explicit = payload.get("verification_state")
        if explicit in ("verified", "unverified", "failed"):
            return explicit
        if payload.get("email_verified") is True:
            return "verified"
        if payload.get("email"):
            return "unverified"
        return "unverified"

    def save_enriched_contact(self, company_obj: Company, payload: dict) -> Contact:
        normalized_title = self.normalize_role(payload.get("job_title", ""))
        email = payload.get("email") or None

        defaults = {
            "full_name": payload.get("full_name", ""),
            "job_title": normalized_title,
            "phone": payload.get("phone"),
            "linkedin_url": payload.get("linkedin_url"),
            "provider_source": payload.get("provider_source", ""),
            "verification_state": self._verification_state(payload),
            "confidence_score": float(payload.get("confidence_score") or 0.0),
            "last_verified_at": timezone.now(),
            "raw_payload": payload,
        }

        if email:
            contact, _ = Contact.objects.update_or_create(
                company=company_obj,
                email=email,
                defaults=defaults,
            )
            return contact
        return Contact.objects.create(company=company_obj, **defaults)