"""Production speech command composition root."""

from origins.application.production_speech import (
    ProductionSpeechCommandService,
)
from origins.infrastructure.postgres.jobs import JobRepository
from origins.infrastructure.postgres.production_speech import (
    ProductionSpeechCommandRepository,
)


production_speech_service = ProductionSpeechCommandService(
    ProductionSpeechCommandRepository(JobRepository()))
