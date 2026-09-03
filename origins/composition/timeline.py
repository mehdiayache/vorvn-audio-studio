"""Concrete Production timeline service assembly."""

from origins.application.timeline import TimelineService
from origins.infrastructure.postgres.timeline import PostgresTimelineRecords
from origins.infrastructure.postgres.transcripts import TranscriptRepository
from origins.infrastructure.timeline_workspace import LocalTimelineWorkspace


timeline_service = TimelineService(
    records=PostgresTimelineRecords(),
    workspace=LocalTimelineWorkspace(),
    transcripts=TranscriptRepository(),
)
