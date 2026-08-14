"""Standalone recording-history service assembly."""

from audio_studio.application.recording_history import RecordingHistoryService
from audio_studio.infrastructure.postgres.recording_history import RecordingHistoryRepository


recording_history_service = RecordingHistoryService(RecordingHistoryRepository())
