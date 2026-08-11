"""Native execution of one queued cloned-voice capability."""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Protocol

from audio_studio.domain.voice_packages import (
    CreatedVoiceBinding,
    VoicePackageJob,
)
from audio_studio.application.provider_operations import ProviderOperationService


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
    def resolve_reference(self, reference: dict) -> Path: ...


class VoiceCloningService:
    def __init__(self, repository: VoicePackageRepository,
                 provider: VoiceCloningProvider,
                 references: VoiceReferenceResolver,
                 operations: ProviderOperationService | None = None,
                 preferences: Callable[[], dict] | None = None):
        self.repository = repository
        self.provider = provider
        self.references = references
        self.operations = operations
        self.preferences = preferences or (lambda: {})

    def work_once(self) -> bool:
        job = self.repository.claim_next()
        if not job:
            return False
        estimate = self.provider.estimated_cost(job)
        activity_id = self.repository.start_attempt(job, estimate)
        reservation_id = None
        attempt_id = None
        try:
            if self.operations:
                reservation_id = self.operations.authorize(
                    activity_id, "voice_enrollment", estimate,
                    self.preferences(), True)
                attempt_id = self.operations.repository.begin_attempt(
                    activity_id, "voice_enrollment", {
                        "provider": "alibaba",
                        "region": job.metadata.get("provider_region") or "intl",
                        "model": job.model_id,
                        "binding_reference_id": job.reference_id,
                    }, {"identity_id": job.identity_id,
                        "reference_id": job.reference_id,
                        "model_id": job.model_id}, reservation_id)
            reference = self.repository.reference(job.reference_id)
            if not reference or not reference.get("normalized_path"):
                raise RuntimeError("The saved reference recording is unavailable.")
            local = self.references.resolve_reference(reference)
            if attempt_id:
                self.operations.repository.mark_sent(attempt_id)
            binding = self.provider.create(job, local)
            if not binding.provider_voice_id:
                raise RuntimeError("Alibaba returned no cloned voice ID.")
            self.repository.complete(job, activity_id, binding)
            if attempt_id:
                self.operations.repository.finish_attempt(
                    attempt_id, "succeeded", cost=binding.cost, usage={},
                    request_ids=[], error={})
        except Exception as exc:
            message = str(exc).strip()[:600] or type(exc).__name__
            if attempt_id:
                status = self.operations.failure_status(exc)
                self.operations.repository.finish_attempt(
                    attempt_id, status, cost=0, usage={}, request_ids=[],
                    error={"type": type(exc).__name__, "message": message})
            self.repository.fail(job, activity_id, message)
        return True
