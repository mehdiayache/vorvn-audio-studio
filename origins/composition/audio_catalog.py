"""Concrete Freesound catalogue assembly."""

from origins.application.audio_catalog import AudioCatalogService
from origins.composition.uploads import upload_service
from origins.config import settings
from origins.infrastructure.settings_administration import EnvironmentSettings
from origins.providers.freesound import FreesoundCatalog


catalog_settings = EnvironmentSettings()
audio_catalog_service = AudioCatalogService(
    catalog=FreesoundCatalog(
        save_oauth_tokens=catalog_settings.save_freesound_tokens),
    uploads=upload_service,
    scratch_root=settings.root / ".incoming",
)
