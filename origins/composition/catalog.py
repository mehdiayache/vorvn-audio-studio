"""Concrete catalogue assembly for HTTP and future clients."""

from origins.application.catalog import CatalogService
from origins.application.preferences import load_preferences
from origins.infrastructure.catalog_environment import CatalogEnvironment
from origins.infrastructure.postgres.control_plane import ControlPlaneRepository
from origins.infrastructure.postgres.voices import VoiceRepository


catalog_service = CatalogService(
    voices=VoiceRepository(),
    control_plane=ControlPlaneRepository(),
    environment=CatalogEnvironment(),
    load_preferences=load_preferences,
)
