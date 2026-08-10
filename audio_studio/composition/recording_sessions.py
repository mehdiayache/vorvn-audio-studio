"""Standalone recording-session service assembly."""

from audio_studio.application.recording_sessions import RecordingSessionService
from audio_studio.infrastructure.postgres.recording_sessions import RecordingSessionRepository


recording_session_service = RecordingSessionService(RecordingSessionRepository())
