"""Durable provider-neutral Media generation use cases."""

from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID

from origins.application.jobs import JobService
from origins.domain.media_generation import (
    MEDIA_GENERATION_KIND, file_list_compatibility_contract, capability,
    input_file_compatibility, validate_preset,
)
from origins.domain.media_models import models, operations_for
from origins.domain.jobs import Job


class VisualFileStore(Protocol):
    def project_exists(self, project_id: int) -> bool: ...
    def workspace_exists(self, workspace_id: int) -> bool: ...
    def list_for_project(self, project_id: int) -> list[dict]: ...
    def list_for_workspace(self, workspace_id: int) -> list[dict]: ...


class MediaGenerationService:
    def __init__(self, jobs: JobService, files: VisualFileStore):
        self.jobs = jobs
        self.files = files

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

    def _available_files(self, context: dict[str, Any]) -> list[dict]:
        workspace_id = int(context["workspace_id"])
        project_id = context.get("project_id")
        if not self.files.workspace_exists(workspace_id):
            raise LookupError("That Workspace no longer exists.")
        if project_id is not None:
            if not self.files.project_exists(int(project_id)):
                raise LookupError("That Project no longer exists.")
            return self.files.list_for_project(int(project_id))
        return self.files.list_for_workspace(workspace_id)

    def enqueue(self, context: dict[str, Any], preset: dict[str, Any], *,
                idempotency_key: str) -> tuple[dict[str, Any], bool]:
        workspace_id = int(context["workspace_id"])
        project_id = context.get("project_id")
        available = {int(file["id"]): file
                     for file in self._available_files(context)}
        validate_preset(preset, available)
        model, operation = capability(preset["model_id"], preset["operation"])
        payload = {
            "workspace_id": workspace_id,
            "project_id": int(project_id) if project_id is not None else None,
            "creation_context": context,
            "preset": preset,
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
            MEDIA_GENERATION_KIND, payload,
            idempotency_key=idempotency_key, workspace_id=workspace_id,
            project_id=int(project_id) if project_id is not None else None,
            creation_context=context,
            source_tool="creator", operation_label=preset["operation"],
        )
        return self.project(job), created

    def recent(self, context: dict[str, Any], limit: int = 20) -> list[dict[str, Any]]:
        project_id = context.get("project_id")
        jobs = (self.jobs.recent_for_project(
            int(project_id), kind=MEDIA_GENERATION_KIND, limit=limit)
            if project_id is not None else self.jobs.recent_for_workspace(
                int(context["workspace_id"]), kind=MEDIA_GENERATION_KIND,
                limit=limit))
        return [self.project(job) for job in jobs]

    def input_compatibility(
        self, context: dict[str, Any], model_id: str, operation: str,
        file_ids: list[int], *, role: str | None = None,
        parameter_key: str | None = None, variant_id: str | None = None,
        audio: bool = False,
    ) -> list[dict[str, Any]]:
        _, selected = capability(model_id, operation)
        if role:
            slot = next((item for item in selected["inputs"]
                         if item["role"] == role), None)
            if not slot:
                raise ValueError(
                    "That semantic input is not supported by this mode.")
        else:
            field = next((item for item in selected["parameters"]
                          if item["key"] == parameter_key), None)
            if not field:
                raise ValueError(
                    "That media parameter is not supported by this mode.")
            slot = file_list_compatibility_contract(
                field, variant_id=variant_id, audio=audio,
            )
        files = {int(file["id"]): file
                 for file in self._available_files(context)}
        results = []
        for file_id in file_ids:
            file = files.get(int(file_id))
            result = (input_file_compatibility(slot, file) if file else {
                "state": "incompatible",
                "reasons": ["This File is not available in this Creator context."],
            })
            results.append({"file_id": int(file_id), **result})
        return results

    def cancel(self, context: dict[str, Any], job_id: UUID) -> dict[str, Any]:
        job = self.jobs.get(job_id)
        if (not job or job.kind != MEDIA_GENERATION_KIND
                or job.creation_context != context):
            raise LookupError("That Media generation no longer exists.")
        snapshot = job.payload.get("capability_snapshot") or {}
        operation = next(iter(snapshot.get("operations") or []), None)
        if operation is None:
            _, operation = capability(job.payload["preset"]["model_id"],
                                      job.payload["preset"]["operation"])
        if not operation["supports_cancel"]:
            raise ValueError("This model operation cannot be canceled.")
        canceled = self.jobs.cancel(job_id)
        if not canceled:
            raise LookupError("That Media generation no longer exists.")
        return self.project(canceled)

    def retry_ingestion(
        self, context: dict[str, Any], job_id: UUID,
    ) -> dict[str, Any]:
        job = self.jobs.get(job_id)
        if (not job or job.kind != MEDIA_GENERATION_KIND
                or job.creation_context != context):
            raise LookupError("That Media generation no longer exists.")
        return self.project(self.jobs.retry_local_ingestion(job_id))

    @staticmethod
    def project(job: Job) -> dict[str, Any]:
        status = {
            "queued": "queued", "running": "generating",
            "retrying": "generating", "ok": "ready", "warning": "ready",
            "cancelled": "canceled", "failed": "failed", "lost": "failed",
            "blocked": "failed",
        }[job.status.value]
        actual_cost = job.result.get("cost")
        return {
            "id": str(job.public_id), "job_id": str(job.public_id),
            "status": status, "progress": round(job.progress * 100),
            "detail": job.detail, "error": job.error or None,
            "preset": job.payload["preset"],
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
            "output_file_ids": job.result.get("output_file_ids") or [],
            "provider_job_id": job.result.get("provider_job_id"),
            "estimated_cost": job.result.get("estimated_cost"),
            "cost": float(actual_cost) if actual_cost is not None else None,
            "usage": job.result.get("usage") or {},
            "needs_confirmation": bool(job.result.get("needs_confirmation")),
            "confirmation_message": job.result.get("confirmation_message"),
            "can_retry_ingestion": bool(
                job.result.get("can_retry_ingestion")),
            "local_ingestion_pending": bool(
                job.result.get("local_ingestion_pending")),
            "requires_review": bool(job.result.get("requires_review")),
            "created_at": job.created_at, "updated_at": (
                job.finished_at or job.started_at or job.created_at),
        }
