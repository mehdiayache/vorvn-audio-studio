"""Concrete Settings service assembly; transports import only this root."""

from audio_studio.application.preferences import load_preferences, save_preferences
from audio_studio.application.settings import SettingsService
from audio_studio.infrastructure.postgres.control_plane import ControlPlaneRepository
from audio_studio.infrastructure.postgres.pronunciations import PronunciationRepository
from audio_studio.infrastructure.settings_administration import (
    EnvironmentSettings,
    FilesystemMaintenance,
)


settings_service = SettingsService(
    control_plane=ControlPlaneRepository(),
    configuration=EnvironmentSettings(),
    maintenance=FilesystemMaintenance(),
    pronunciations=PronunciationRepository(),
    load_preferences=load_preferences,
    save_preferences=save_preferences,
)
