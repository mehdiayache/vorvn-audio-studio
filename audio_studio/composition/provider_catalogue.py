"""Provider catalogue composition root."""

from audio_studio.application.provider_catalogue import ProviderCatalogueSync
from audio_studio.infrastructure.postgres.provider_catalogue import (
    ProviderCatalogueRepository,
)


provider_catalogue_sync = ProviderCatalogueSync(ProviderCatalogueRepository())
