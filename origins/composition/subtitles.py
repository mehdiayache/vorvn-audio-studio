"""Concrete saved-subtitle catalogue assembly."""

from origins.application.subtitles import SubtitleCatalogueService
from origins.composition.media import media_service
from origins.infrastructure.postgres.transcripts import TranscriptRepository


subtitle_service = SubtitleCatalogueService(
    records=TranscriptRepository(),
    media=media_service,
)
