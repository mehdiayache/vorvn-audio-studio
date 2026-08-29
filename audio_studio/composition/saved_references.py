"""Saved-reference composition root."""

from audio_studio.application.saved_references import SavedReferenceService
from audio_studio.infrastructure.postgres.saved_references import (
    SavedReferenceRepository,
)


saved_reference_service = SavedReferenceService(SavedReferenceRepository())
