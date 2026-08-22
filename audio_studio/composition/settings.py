"""Concrete Settings service assembly; transports import only this root."""

from audio_studio.application.preferences import load_preferences, save_preferences
from audio_studio.application.settings import SettingsService
from audio_studio.infrastructure.postgres.control_plane import ControlPlaneRepository
from audio_studio.infrastructure.postgres.pronunciations import PronunciationRepository
from audio_studio.infrastructure.settings_administration import (
    EnvironmentSettings,
    FilesystemMaintenance,
)
from audio_studio.providers.alibaba.connection import test_saved_connection


settings_service = SettingsService(
    control_plane=ControlPlaneRepository(),
    configuration=EnvironmentSettings(),
    maintenance=FilesystemMaintenance(),
    pronunciations=PronunciationRepository(),
    provider_connection_test=test_saved_connection,
    load_preferences=load_preferences,
    save_preferences=save_preferences,
)
