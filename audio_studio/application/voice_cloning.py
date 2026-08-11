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
    def recoverable_binding(self, job: VoicePackageJob
                            ) -> CreatedVoiceBinding | None: ...
    def complete(self, job: VoicePackageJob, activity_id: int,
                 binding: CreatedVoiceBinding, *, recovered: bool = False
                 ) -> None: ...
    def fail(self, job: VoicePackageJob, activity_id: int,
             error: str) -> None: ...


class VoiceCloningProvider(Protocol):
    def estimated_cost(self, job: VoicePackageJob) -> float: ...
    def create(self, job: VoicePackageJob,
               local: Path, on_sent: Callable[[], None]
               ) -> CreatedVoiceBinding: ...


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
        recovered = self.repository.recoverable_binding(job)
        if recovered:
            activity_id = self.repository.start_attempt(
                job, recovered.estimated_cost)
            try:
                self.repository.complete(
                    job, activity_id, recovered, recovered=True)
            except Exception as exc:
                message = str(exc).strip()[:600] or type(exc).__name__
                self.repository.fail(job, activity_id, message)
            return True
        try:
            estimate = self.provider.estimated_cost(job)
            reference = self.repository.reference(job.reference_id)
            if not reference or not reference.get("normalized_path"):
                raise RuntimeError("The saved reference recording is unavailable.")
            local = self.references.resolve_reference(reference)
        except Exception as exc:
            # Route/configuration/reference resolution is local and free.
            # Persist the failed Job without inventing provider evidence.
            activity_id = self.repository.start_attempt(job, 0)
            message = str(exc).strip()[:600] or type(exc).__name__
            self.repository.fail(job, activity_id, message)
            return True
        activity_id = self.repository.start_attempt(job, estimate)
        reservation_id = None
        attempt_id = None
        request_sent = False
        try:
            if self.operations:
                reservation_id = self.operations.authorize(
                    activity_id, "voice_enrollment", estimate,
                    self.preferences(), True)
                attempt_id = self.operations.repository.begin_attempt(
                    activity_id, "voice_enrollment", {
                        "provider": job.provider,
                        "region": job.region,
                        "provider_model_id": job.provider_model_id,
                        "adapter_key": job.adapter_key,
                        "model": job.model_id,
                        "binding_reference_id": job.reference_id,
                    }, {"identity_id": job.identity_id,
                        "reference_id": job.reference_id,
                        "model_id": job.model_id}, reservation_id)
            def mark_sent() -> None:
                nonlocal request_sent
                if request_sent:
                    return
                request_sent = True
                if attempt_id:
                    self.operations.repository.mark_sent(attempt_id)

            binding = self.provider.create(job, local, mark_sent)
            if not binding.provider_voice_id:
                raise RuntimeError("The provider returned no cloned voice ID.")
            if attempt_id:
                self.operations.repository.finish_attempt(
                    attempt_id, "succeeded", cost=binding.cost, usage={},
                    request_ids=[], error={}, receipt={
                        "provider_voice_id": binding.provider_voice_id,
                        "provider_region": binding.provider_region,
                        "provider_endpoint": binding.provider_endpoint,
                        "price_version": binding.price_version,
                        "estimated_cost": binding.estimated_cost,
                        "cost": binding.cost,
                        "cost_basis": binding.cost_basis,
                    })
            self.repository.complete(job, activity_id, binding)
        except Exception as exc:
            message = str(exc).strip()[:600] or type(exc).__name__
            if attempt_id:
                status = (self.operations.failure_status(exc)
                          if request_sent else "definitive_failed")
                self.operations.repository.finish_attempt(
                    attempt_id, status, cost=0, usage={}, request_ids=[],
                    error={"type": type(exc).__name__, "message": message})
            self.repository.fail(job, activity_id, message)
        return True
