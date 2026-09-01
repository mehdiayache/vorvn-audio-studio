"""Canonical Creation output File assembly shared by worker handlers."""

from audio_studio.application.creation_files import CreationFileService
from audio_studio.composition.jobs import job_service
from audio_studio.infrastructure.creation_file_storage import (
    LocalCreationFileStorage,
)
from audio_studio.infrastructure.postgres.uploads import PostgresUploadRecords


creation_file_service = CreationFileService(
    PostgresUploadRecords(), job_service, LocalCreationFileStorage())
