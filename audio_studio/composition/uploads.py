"""Concrete upload service assembly."""

from audio_studio.application.uploads import UploadService
from audio_studio.infrastructure.postgres.uploads import PostgresUploadRecords
from audio_studio.infrastructure.upload_workspace import LocalUploadWorkspace


upload_service = UploadService(
    workspace=LocalUploadWorkspace(),
    records=PostgresUploadRecords(),
)
