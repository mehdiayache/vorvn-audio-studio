"""Standalone recording-history service assembly."""

from origins.application.recording_history import RecordingHistoryService
from origins.infrastructure.postgres.recording_history import RecordingHistoryRepository


recording_history_service = RecordingHistoryService(RecordingHistoryRepository())
