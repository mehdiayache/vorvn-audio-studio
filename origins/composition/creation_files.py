"""Canonical Creation output File assembly shared by worker handlers."""

from origins.application.creation_files import CreationFileService
from origins.composition.jobs import job_service
from origins.infrastructure.creation_file_storage import (
    LocalCreationFileStorage,
)
from origins.infrastructure.postgres.uploads import PostgresUploadRecords


creation_file_service = CreationFileService(
    PostgresUploadRecords(), job_service, LocalCreationFileStorage())
