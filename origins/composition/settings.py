"""Concrete Settings service assembly; transports import only this root."""

from origins.application.preferences import load_preferences, save_preferences
from origins.application.settings import SettingsService
from origins.infrastructure.postgres.control_plane import ControlPlaneRepository
from origins.infrastructure.postgres.pronunciations import PronunciationRepository
from origins.infrastructure.settings_administration import (
    EnvironmentSettings,
    FilesystemMaintenance,
)
from origins.providers.alibaba.connection import test_saved_connection
from origins.providers.kie.provider import KieMediaGenerationProvider


settings_service = SettingsService(
    control_plane=ControlPlaneRepository(),
    configuration=EnvironmentSettings(),
    maintenance=FilesystemMaintenance(),
    pronunciations=PronunciationRepository(),
    provider_connection_test=test_saved_connection,
    media_generation_provider_connection_test=KieMediaGenerationProvider().status,
    load_preferences=load_preferences,
    save_preferences=save_preferences,
)
