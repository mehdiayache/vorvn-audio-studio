"""Durable provider-neutral Director generation use cases."""

from __future__ import annotations

import time
from typing import Any, Callable, Protocol
from uuid import UUID

from audio_studio.application.jobs import JobProgress, JobService
from audio_studio.domain.director_generation import (
    CAPABILITIES, DIRECTOR_GENERATION_KIND, OPERATIONS, capability,
    validate_recipe,
)
from audio_studio.domain.jobs import Job


class DirectorAssetStore(Protocol):
    def production_exists(self, production_id: int) -> bool: ...
    def list_for_production(self, production_id: int) -> list[dict]: ...


class DirectorGenerationService:
    def __init__(self, jobs: JobService, assets: DirectorAssetStore):
        self.jobs = jobs
        self.assets = assets

    def capabilities(self) -> dict[str, Any]:
        return {"operations": list(OPERATIONS), "models": list(CAPABILITIES)}

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
            "model": model["id"],
            "model_label": model["label"],
            "model_version": model["version"],
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
            "model_label": job.payload["model_label"],
            "model_version": job.payload["model_version"],
            "output_media_type": job.payload["output_media_type"],
            "output_asset_ids": job.result.get("output_asset_ids") or [],
            "provider_job_id": job.result.get("provider_job_id"),
            "estimated_cost": job.result.get("estimated_cost"),
            "created_at": job.created_at, "updated_at": (
                job.finished_at or job.started_at or job.created_at),
        }


class MockDirectorGenerationHandler:
    """Temporary executor using the same durable boundary as a future provider."""

    def __init__(self, pause: Callable[[float], None] = time.sleep):
        self.pause = pause

    def __call__(self, job: Job, progress: JobProgress) -> dict[str, Any]:
        progress.progress(job.id, 1, 3, "Preparing prototype")
        self.pause(.25)
        progress.progress(job.id, 2, 3, "Creating prototype")
        self.pause(.45)
        progress.progress(job.id, 3, 3, "Prototype ready")
        return {"output_asset_ids": [], "provider_job_id": None,
                "estimated_cost": None}
