"""Provider callback persistence assembled at the composition boundary."""

from audio_studio.infrastructure.postgres.provider_operations import (
    ProviderOperationRepository,
)


provider_callback_recorder = ProviderOperationRepository()
