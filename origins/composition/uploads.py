"""Concrete upload service assembly."""

from origins.application.uploads import UploadService
from origins.infrastructure.postgres.uploads import PostgresUploadRecords
from origins.infrastructure.upload_workspace import LocalUploadWorkspace


upload_service = UploadService(
    workspace=LocalUploadWorkspace(),
    records=PostgresUploadRecords(),
)
