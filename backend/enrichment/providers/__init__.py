from enrichment.models import EnrichmentSource

from .apollo import ApolloProvider
from .base import ContactEnrichmentProvider, ProviderError
from .contactout import ContactOutProvider
from .lusha import LushaProvider
from .pdl import PeopleDataLabsProvider

ENRICHMENT_PROVIDER_REGISTRY: dict[str, type[ContactEnrichmentProvider]] = {
    "pdl": PeopleDataLabsProvider,
    "contactout": ContactOutProvider,
    "apollo": ApolloProvider,
    "lusha": LushaProvider,
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
    "LushaProvider",
    "PeopleDataLabsProvider",
    "ProviderError",
    "get_enrichment_provider",
]