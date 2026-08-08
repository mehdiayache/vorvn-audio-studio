"""Job use cases independent of HTTP and worker process lifecycle."""

from __future__ import annotations

from typing import Any, Callable

from audio_studio.domain.jobs import Job
from audio_studio.infrastructure.postgres.jobs import JobRepository


JobHandler = Callable[[Job, JobRepository], dict[str, Any]]


class JobService:
    def __init__(self, repository: JobRepository | None = None):
        self.repository = repository or JobRepository()
        self.handlers: dict[str, JobHandler] = {}

    def register(self, kind: str, handler: JobHandler) -> None:
        self.handlers[kind] = handler

    def work_once(self) -> bool:
        job = self.repository.claim_next(self.handlers)
        if not job:
            return False
        try:
            result = self.handlers[job.kind](job, self.repository)
            status = "blocked" if result.get("needs_confirmation") else "warning" if result.get("warning") or result.get("failures") else "ok"
            self.repository.finish(job.id, result,
                                   cost=float(result.get("cost") or 0),
                                   usage=result.get("usage") or {},
                                   status=status)
        except Exception as exc:
            # Paid provider requests are not blindly retried: a lost response
            # can still have been billed. The operator decides whether to retry.
            self.repository.fail(job.id, f"{type(exc).__name__}: {exc}", retry=False)
        return True
