"""Concrete Freesound catalogue assembly."""

from audio_studio.application.audio_catalog import AudioCatalogService
from audio_studio.composition.uploads import upload_service
from audio_studio.config import settings
from audio_studio.infrastructure.settings_administration import EnvironmentSettings
from audio_studio.providers.freesound import FreesoundCatalog


catalog_settings = EnvironmentSettings()
audio_catalog_service = AudioCatalogService(
    catalog=FreesoundCatalog(
        save_oauth_tokens=catalog_settings.save_freesound_tokens),
    uploads=upload_service,
    scratch_root=settings.root / ".incoming",
)
