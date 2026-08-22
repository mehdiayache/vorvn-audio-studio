"""Concrete Freesound catalogue assembly."""

from audio_studio.application.audio_catalog import AudioCatalogService
from audio_studio.composition.uploads import upload_service
from audio_studio.config import settings
from audio_studio.providers.freesound import FreesoundCatalog


audio_catalog_service = AudioCatalogService(
    catalog=FreesoundCatalog(), uploads=upload_service,
    scratch_root=settings.root / ".incoming",
)
