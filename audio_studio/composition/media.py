"""Concrete media delivery service assembly."""

from audio_studio.application.media import MediaService
from audio_studio.infrastructure.media_workspace import LocalMediaWorkspace
from audio_studio.infrastructure.postgres.media_records import PostgresMediaRecords


media_service = MediaService(
    workspace=LocalMediaWorkspace(),
    records=PostgresMediaRecords(),
)
