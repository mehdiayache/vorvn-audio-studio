"""Concrete Batch intake service assembly for the HTTP process."""

from audio_studio.application.batches import BatchIntakeService
from audio_studio.infrastructure.batch_workspace import FilesystemBatchWorkspace
from audio_studio.infrastructure.postgres.speech import SpeechRepository


batch_intake_service = BatchIntakeService(
    FilesystemBatchWorkspace(),
    SpeechRepository(),
)
