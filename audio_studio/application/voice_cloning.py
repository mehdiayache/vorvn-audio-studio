"""Native execution of one queued cloned-voice capability."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from audio_studio.domain.voice_packages import (
    CreatedVoiceBinding,
    VoicePackageJob,
)


class VoicePackageRepository(Protocol):
    def claim_next(self) -> VoicePackageJob | None: ...
    def reference(self, reference_id: str) -> dict | None: ...
    def start_attempt(self, job: VoicePackageJob, estimate: float) -> int: ...
    def complete(self, job: VoicePackageJob, activity_id: int,
                 binding: CreatedVoiceBinding) -> None: ...
    def fail(self, job: VoicePackageJob, activity_id: int,
             error: str) -> None: ...


class VoiceCloningProvider(Protocol):
    def estimated_cost(self, job: VoicePackageJob) -> float: ...
    def create(self, job: VoicePackageJob,
               local: Path) -> CreatedVoiceBinding: ...


class VoiceReferenceResolver(Protocol):
    def resolve(self, stored_name: str) -> Path: ...


class VoiceCloningService:
    def __init__(self, repository: VoicePackageRepository,
                 provider: VoiceCloningProvider,
                 references: VoiceReferenceResolver):
        self.repository = repository
        self.provider = provider
        self.references = references

    def work_once(self) -> bool:
        job = self.repository.claim_next()
        if not job:
            return False
        activity_id = self.repository.start_attempt(
            job, self.provider.estimated_cost(job))
        try:
            reference = self.repository.reference(job.reference_id)
            if not reference or not reference.get("normalized_path"):
                raise RuntimeError("The saved reference recording is unavailable.")
            local = self.references.resolve(str(reference["normalized_path"]))
            binding = self.provider.create(job, local)
            if not binding.provider_voice_id:
                raise RuntimeError("Alibaba returned no cloned voice ID.")
            self.repository.complete(job, activity_id, binding)
        except Exception as exc:
            message = str(exc).strip()[:600] or type(exc).__name__
            self.repository.fail(job, activity_id, message)
        return True
