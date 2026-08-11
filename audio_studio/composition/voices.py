"""Concrete voice identity and capability service assembly."""

from audio_studio.application.preferences import load_preferences
from audio_studio.application.voices import VoiceService
from audio_studio.infrastructure.postgres.voice_packages import VoicePackageRepository
from audio_studio.infrastructure.postgres.voices import VoiceRepository
from audio_studio.infrastructure.postgres.provider_catalogue import (
    ProviderCatalogueRepository,
)


voice_service = VoiceService(
    profiles_store=VoiceRepository(),
    package_store=VoicePackageRepository(),
    method_store=ProviderCatalogueRepository(),
    preferences=load_preferences,
)
