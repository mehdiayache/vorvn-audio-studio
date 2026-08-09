"""Concrete saved-subtitle catalogue assembly."""

from audio_studio.application.subtitles import SubtitleCatalogueService
from audio_studio.composition.media import media_service
from audio_studio.infrastructure.postgres.transcripts import TranscriptRepository


subtitle_service = SubtitleCatalogueService(
    records=TranscriptRepository(),
    media=media_service,
)
