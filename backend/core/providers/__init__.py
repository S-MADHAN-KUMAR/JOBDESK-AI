from core.models import JobSource

from .apify import ApifyProvider
from .base import JobSourceProvider, ProviderError
from .coresignal import CoresignalProvider
from .serpapi import SerpApiProvider

PROVIDER_REGISTRY: dict[str, type[JobSourceProvider]] = {
    "serpapi": SerpApiProvider,
    "apify": ApifyProvider,
    "coresignal": CoresignalProvider,
}


def get_provider(source: JobSource) -> JobSourceProvider:
    """Resolve the concrete provider implementation for a JobSource config."""
    cls = PROVIDER_REGISTRY.get(source.provider_code)
    if cls is None:
        raise ProviderError(f"No connector implemented for provider: {source.provider_code}")
    return cls(source)


__all__ = [
    "ApifyProvider",
    "CoresignalProvider",
    "JobSourceProvider",
    "PROVIDER_REGISTRY",
    "ProviderError",
    "SerpApiProvider",
    "get_provider",
]