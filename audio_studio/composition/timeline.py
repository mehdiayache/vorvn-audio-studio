"""Concrete Production timeline service assembly."""

from audio_studio.application.timeline import TimelineService
from audio_studio.infrastructure.postgres.timeline import PostgresTimelineRecords
from audio_studio.infrastructure.postgres.transcripts import TranscriptRepository
from audio_studio.infrastructure.timeline_workspace import LocalTimelineWorkspace


timeline_service = TimelineService(
    records=PostgresTimelineRecords(),
    workspace=LocalTimelineWorkspace(),
    transcripts=TranscriptRepository(),
)
