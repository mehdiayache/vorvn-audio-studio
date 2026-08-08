"""Worker-only adapter for provider operations not yet extracted from server.py."""

from __future__ import annotations

from typing import Any

import httpx
from domain import repository as domain_repository

from audio_studio.config import settings
from audio_studio.domain.jobs import Job
from audio_studio.infrastructure.postgres.jobs import JobRepository


class LegacyProviderJobHandlers:
    """Run paid provider calls behind the durable queue during the cutover."""

    def speech(self, job: Job, repository: JobRepository) -> dict[str, Any]:
        operation = job.payload.get("operation", "create")
        path = {"create": "/api/speak", "regenerate": "/api/part/regenerate",
                "render_draft": "/api/part/render"}.get(operation)
        if not path:
            raise RuntimeError("Unknown speech operation.")
        payload = dict(job.payload)
        if operation == "create" and payload.get("project_id"):
            production = domain_repository.production_get(int(payload["project_id"]))
            if not production:
                raise RuntimeError("The destination Production no longer exists.")
            payload["project_id"] = int(production["legacy_container_id"])
        if operation != "create":
            payload["id"] = payload.pop("part_id")
        payload.pop("operation", None)
        return self._post(job, repository, path, "Preparing speech", payload)

    def batch(self, job: Job, repository: JobRepository) -> dict[str, Any]:
        return self._post(job, repository, "/api/batch/run", "Generating batch rows")

    def transcribe(self, job: Job, repository: JobRepository) -> dict[str, Any]:
        return self._post(job, repository, "/api/transcribe", "Transcribing audio")

    def translate(self, job: Job, repository: JobRepository) -> dict[str, Any]:
        return self._post(job, repository, "/api/translate/subtitles", "Translating subtitles")

    def _post(self, job: Job, repository: JobRepository, path: str,
              label: str, values: dict[str, Any] | None = None) -> dict[str, Any]:
        repository.progress(job.id, 0, 1, label)
        payload = {**(values or job.payload), "_durable_job": True,
                   "_durable_job_id": job.id}
        with httpx.Client(timeout=None) as client:
            response = client.post(f"{settings.legacy_origin}{path}", json=payload)
        try:
            result = response.json()
        except ValueError as exc:
            raise RuntimeError("The provider returned an unreadable response.") from exc
        if response.status_code >= 400 or result.get("error"):
            raise RuntimeError(str(result.get("error") or f"Provider operation failed ({response.status_code})."))
        repository.progress(job.id, 1, 1, "Complete")
        return result
