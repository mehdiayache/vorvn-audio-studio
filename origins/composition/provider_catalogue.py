"""Provider catalogue composition root."""

from origins.application.provider_catalogue import ProviderCatalogueSync
from origins.infrastructure.postgres.provider_catalogue import (
    ProviderCatalogueRepository,
)


provider_catalogue_sync = ProviderCatalogueSync(ProviderCatalogueRepository())
