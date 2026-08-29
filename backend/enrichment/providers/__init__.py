from enrichment.models import EnrichmentSource

from .apollo import ApolloProvider
from .base import ContactEnrichmentProvider, ProviderError
from .contactout import ContactOutProvider

ENRICHMENT_PROVIDER_REGISTRY: dict[str, type[ContactEnrichmentProvider]] = {
    "contactout": ContactOutProvider,
    "apollo": ApolloProvider,
}


def get_enrichment_provider(source: EnrichmentSource) -> ContactEnrichmentProvider:
    """Resolve the concrete enrichment provider for an EnrichmentSource config."""
    cls = ENRICHMENT_PROVIDER_REGISTRY.get(source.provider_code)
    if cls is None:
        raise ProviderError(
            f"No enrichment connector implemented for provider: {source.provider_code}"
        )
    return cls(source)


__all__ = [
    "ApolloProvider",
    "ContactEnrichmentProvider",
    "ContactOutProvider",
    "ENRICHMENT_PROVIDER_REGISTRY",
    "ProviderError",
    "get_enrichment_provider",
]
