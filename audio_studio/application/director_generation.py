"""Durable provider-neutral Director generation use cases."""

from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID

from audio_studio.application.jobs import JobService
from audio_studio.domain.director_generation import (
    DIRECTOR_GENERATION_KIND, capability, validate_recipe,
)
from audio_studio.domain.director_models import models, operations_for
from audio_studio.domain.jobs import Job


class DirectorAssetStore(Protocol):
    def production_exists(self, production_id: int) -> bool: ...
    def list_for_production(self, production_id: int) -> list[dict]: ...


class DirectorGenerationService:
    def __init__(self, jobs: JobService, assets: DirectorAssetStore):
        self.jobs = jobs
        self.assets = assets

    def capabilities(self) -> dict[str, Any]:
        available = models()
        return {
            "providers": [
                {"id": "kie", "label": "KIE"},
                {"id": "alibaba_sg", "label": "Alibaba Singapore"},
            ],
            "operations": operations_for(available),
            "models": available,
        }

    def enqueue(self, production_id: int, recipe: dict[str, Any], *,
                idempotency_key: str) -> tuple[dict[str, Any], bool]:
        if not self.assets.production_exists(production_id):
            raise LookupError("That Production no longer exists.")
        available = {int(asset["id"]): asset
                     for asset in self.assets.list_for_production(production_id)}
        validate_recipe(recipe, available)
        model, operation = capability(recipe["model_id"], recipe["operation"])
        payload = {
            "production_id": production_id,
            "recipe": recipe,
            "provider": model["provider"],
            "provider_id": model["provider_id"],
            "model": model["id"],
            "provider_model_id": model["provider_model_id"],
            "model_label": model["label"],
            "model_version": model["provider_model_id"],
            "adapter_version": model["adapter_version"],
            "capability_manifest_version": model[
                "capability_manifest_version"],
            "capability_snapshot": {**model, "operations": [operation]},
            "output_media_type": operation["output_media_type"],
        }
        job, created = self.jobs.enqueue(
            DIRECTOR_GENERATION_KIND, payload,
            idempotency_key=idempotency_key, production_id=production_id,
            source_tool="director", operation_label=recipe["operation"],
        )
        return self.project(job), created

    def recent(self, production_id: int, limit: int = 20) -> list[dict[str, Any]]:
        return [self.project(job) for job in self.jobs.recent_for_production(
            production_id, kind=DIRECTOR_GENERATION_KIND, limit=limit)]

    def cancel(self, production_id: int, job_id: UUID) -> dict[str, Any]:
        job = self.jobs.get(job_id)
        if (not job or job.kind != DIRECTOR_GENERATION_KIND
                or int(job.payload.get("production_id") or 0) != production_id):
            raise LookupError("That Director generation no longer exists.")
        snapshot = job.payload.get("capability_snapshot") or {}
        operation = next(iter(snapshot.get("operations") or []), None)
        if operation is None:
            _, operation = capability(job.payload["recipe"]["model_id"],
                                      job.payload["recipe"]["operation"])
        if not operation["supports_cancel"]:
            raise ValueError("This model operation cannot be canceled.")
        canceled = self.jobs.cancel(job_id)
        if not canceled:
            raise LookupError("That Director generation no longer exists.")
        return self.project(canceled)

    @staticmethod
    def project(job: Job) -> dict[str, Any]:
        status = {
            "queued": "queued", "running": "generating",
            "retrying": "generating", "ok": "ready", "warning": "ready",
            "cancelled": "canceled", "failed": "failed", "lost": "failed",
            "blocked": "failed",
        }[job.status.value]
        return {
            "id": str(job.public_id), "job_id": str(job.public_id),
            "status": status, "progress": round(job.progress * 100),
            "detail": job.detail, "error": job.error or None,
            "recipe": job.payload["recipe"],
            "provider": job.payload["provider"],
            "provider_id": job.payload.get("provider_id"),
            "provider_model_id": job.payload.get("provider_model_id"),
            "model_label": job.payload["model_label"],
            "model_version": job.payload["model_version"],
            "adapter_version": job.payload.get("adapter_version"),
            "capability_manifest_version": job.payload.get(
                "capability_manifest_version"),
            "capability_snapshot": job.payload.get("capability_snapshot"),
            "output_media_type": job.payload["output_media_type"],
            "output_asset_ids": job.result.get("output_asset_ids") or [],
            "provider_job_id": job.result.get("provider_job_id"),
            "estimated_cost": job.result.get("estimated_cost"),
            "created_at": job.created_at, "updated_at": (
                job.finished_at or job.started_at or job.created_at),
        }
