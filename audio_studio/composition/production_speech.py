"""Production speech command composition root."""

from audio_studio.application.production_speech import (
    ProductionSpeechCommandService,
)
from audio_studio.infrastructure.postgres.jobs import JobRepository
from audio_studio.infrastructure.postgres.production_speech import (
    ProductionSpeechCommandRepository,
)


production_speech_service = ProductionSpeechCommandService(
    ProductionSpeechCommandRepository(JobRepository()))
