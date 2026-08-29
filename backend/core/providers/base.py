"""Abstract base provider interface enforcing modular provider isolation (SRS Section 6)."""

import html
import re
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from core.models import JobSource


class ProviderError(Exception):
    """Raised when a provider request fails; message is surfaced to the UI."""


API_KEY_FIELDS = ("api_key", "apikey", "apify_token", "apify_key", "token")


def extract_api_key(auth_config: Dict[str, Any]) -> str:
    """Return the API key/token from an auth config under any common field name."""
    for field in API_KEY_FIELDS:
        value = auth_config.get(field)
        if value:
            return str(value)
    return ""


def strip_html(text: Any) -> str:
    """Strip HTML tags and collapse whitespace from a raw provider value."""
    if text is None:
        return ""
    value = html.unescape(str(text))
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", value).strip()


class JobSourceProvider(ABC):
    """
    Common internal interface enforcing modular provider isolation (SRS Section 6).

    All job connectors (SerpApi, Apify) MUST inherit from this base class.
    """

    def __init__(self, source_config: JobSource):
        self.config = source_config

    @abstractmethod
    def search_jobs(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Query external provider API using defined keyword, location, date filters."""

    @abstractmethod
    def fetch_job_detail(self, external_id: str) -> Dict[str, Any]:
        """Fetch full job payload details using provider external listing ID."""

    @abstractmethod
    def normalize_source_record(self, raw_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Map provider specific JSON attributes to staging normalized schema."""

    @abstractmethod
    def health_check(self) -> bool:
        """Ping API endpoint to verify key validity, server accessibility, quota headroom."""

    @abstractmethod
    def get_rate_limit_state(self) -> Dict[str, int]:
        """Return remaining daily requests and active request-per-minute counters."""

    @abstractmethod
    def get_usage_metrics(self) -> Dict[str, Any]:
        """Return usage stats and operational metric data."""

    def fetch_credit_usage(self) -> Dict[str, Any]:
        """Return normalized remaining credits from the provider account API."""
        return {}

    def persist_credit_usage(self, usage: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Fetch (if needed) and store credit balances on JobSource."""
        from django.utils import timezone

        data = usage if usage is not None else self.fetch_credit_usage()
        if not data:
            return dict(self.config.credit_usage or {})
        previous = dict(self.config.credit_usage or {})
        payload = {
            **previous,
            **{k: v for k, v in data.items() if v is not None},
            'updated_at': timezone.now().isoformat(),
        }
        JobSource.objects.filter(pk=self.config.pk).update(credit_usage=payload)
        self.config.credit_usage = payload
        return payload
