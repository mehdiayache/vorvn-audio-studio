"""Saved-reference composition root."""

from origins.application.saved_references import SavedReferenceService
from origins.infrastructure.postgres.saved_references import (
    SavedReferenceRepository,
)


saved_reference_service = SavedReferenceService(SavedReferenceRepository())
