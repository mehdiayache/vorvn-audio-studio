"""Concrete Audio Generation assembly shared by API and worker."""

from origins.application.audio_generation import (
    create_audio_generation_service,
)
from origins.composition.jobs import job_service
from origins.composition.uploads import upload_service
from origins.config import settings
from origins.infrastructure.upload_workspace import inspect_audio


audio_generation_service = create_audio_generation_service(
    jobs=job_service,
    uploads=upload_service,
    scratch_root=settings.root / ".incoming",
    inspect_audio=inspect_audio,
)
