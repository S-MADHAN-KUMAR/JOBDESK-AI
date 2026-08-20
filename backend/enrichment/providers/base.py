"""Abstract contract for contact enrichment providers (SRS Section 7, Module 2)."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from core.providers.base import ProviderError, extract_api_key, strip_html

__all__ = ['ContactEnrichmentProvider', 'ProviderError', 'extract_api_key', 'strip_html']


class ContactEnrichmentProvider(ABC):
    """Abstract interface for all contact enrichment providers (SRS Section 7)."""

    def __init__(self, source_config):
        self.config = source_config

    def _api_key(self) -> str:
        key = extract_api_key(self.config.get_auth_config())
        if not key:
            raise ProviderError(
                f"{self.config.provider_code} API key is not configured."
            )
        return key

    @abstractmethod
    def search_people(
        self,
        company: str,
        titles: List[str],
        location: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Find recruiters / TA contacts at target company."""

    @abstractmethod
    def enrich_person(self, identifiers: Dict[str, Any]) -> Dict[str, Any]:
        """Fetch email, phone, and profile details for a person."""

    @abstractmethod
    def health_check(self) -> bool:
        """Verify API connectivity and key validity."""