"""Concrete catalogue assembly for HTTP and future clients."""

from audio_studio.application.catalog import CatalogService
from audio_studio.application.preferences import load_preferences
from audio_studio.infrastructure.catalog_environment import CatalogEnvironment
from audio_studio.infrastructure.postgres.control_plane import ControlPlaneRepository
from audio_studio.infrastructure.postgres.voices import VoiceRepository


catalog_service = CatalogService(
    voices=VoiceRepository(),
    control_plane=ControlPlaneRepository(),
    environment=CatalogEnvironment(),
    load_preferences=load_preferences,
)
