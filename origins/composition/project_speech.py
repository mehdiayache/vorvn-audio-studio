"""Project speech command composition root."""

from origins.application.project_speech import (
    ProjectSpeechCommandService,
)
from origins.infrastructure.postgres.jobs import JobRepository
from origins.infrastructure.postgres.project_speech import (
    ProjectSpeechCommandRepository,
)


project_speech_service = ProjectSpeechCommandService(
    ProjectSpeechCommandRepository(JobRepository()))
