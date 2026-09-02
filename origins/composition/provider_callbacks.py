"""Provider callback persistence assembled at the composition boundary."""

from origins.infrastructure.postgres.provider_operations import (
    ProviderOperationRepository,
)


provider_callback_recorder = ProviderOperationRepository()
