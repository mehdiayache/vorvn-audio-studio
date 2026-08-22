"""Concrete Audio Generation assembly shared by API and worker."""

from audio_studio.application.audio_generation import (
    create_audio_generation_service,
)
from audio_studio.composition.jobs import job_service
from audio_studio.composition.uploads import upload_service
from audio_studio.config import settings
from audio_studio.infrastructure.upload_workspace import inspect_audio


audio_generation_service = create_audio_generation_service(
    jobs=job_service,
    uploads=upload_service,
    scratch_root=settings.root / ".incoming",
    inspect_audio=inspect_audio,
)
