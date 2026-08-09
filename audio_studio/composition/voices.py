"""Concrete voice identity and capability service assembly."""

from audio_studio.application.preferences import load_preferences
from audio_studio.application.voices import VoiceService
from audio_studio.infrastructure.postgres.voice_packages import VoicePackageRepository
from audio_studio.infrastructure.postgres.voices import VoiceRepository


voice_service = VoiceService(
    profiles_store=VoiceRepository(),
    package_store=VoicePackageRepository(),
    preferences=load_preferences,
)
