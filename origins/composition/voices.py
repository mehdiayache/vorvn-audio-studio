"""Concrete voice identity and capability service assembly."""

from origins.application.preferences import load_preferences
from origins.application.voices import VoiceService
from origins.infrastructure.postgres.voice_packages import VoicePackageRepository
from origins.infrastructure.postgres.voices import VoiceRepository
from origins.infrastructure.postgres.provider_catalogue import (
    ProviderCatalogueRepository,
)


voice_service = VoiceService(
    profiles_store=VoiceRepository(),
    package_store=VoicePackageRepository(),
    method_store=ProviderCatalogueRepository(),
    preferences=load_preferences,
)
