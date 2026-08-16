"""Concrete Work hierarchy service assembly."""

from audio_studio.application.work import WorkService
from audio_studio.infrastructure.postgres.work_service import PostgresWorkRecords
from audio_studio.infrastructure.timeline_workspace import LocalTimelineWorkspace


work_service = WorkService(PostgresWorkRecords(), LocalTimelineWorkspace())
