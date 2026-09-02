"""Job use cases independent of HTTP and worker process lifecycle."""

from __future__ import annotations

from typing import Any, Callable, Iterable, Protocol
import threading
from uuid import UUID

from origins.domain.jobs import Job, JobCancelled, JobFailed


class JobProgress(Protocol):
    def progress(self, job_id: int, done: int, total: int,
                 detail: str = "") -> None: ...


class JobStore(JobProgress, Protocol):
    def heartbeat(self, job_id: int) -> bool: ...
    def claim_next(self, kinds: Iterable[str]) -> Job | None: ...
    def finish(self, job_id: int, result: dict[str, Any], **values) -> bool: ...
    def fail(self, job_id: int, error: str, retry: bool = False,
             result: dict[str, Any] | None = None) -> None: ...
    def enqueue(self, kind: str, payload: dict[str, Any], **values) \
            -> tuple[Job, bool]: ...
    def get(self, public_id: UUID) -> Job | None: ...
    def recent_for_project(self, project_id: int, *, kind: str,
                           limit: int = 8) -> list[Job]: ...
    def recent_for_workspace(self, workspace_id: int, *, kind: str,
                         limit: int = 8) -> list[Job]: ...
    def attach_output_file(self, public_id: UUID, file_id: int) -> bool: ...
    def events(self, public_id: UUID) -> list[dict[str, Any]]: ...
    def cancel(self, public_id: UUID) -> Job | None: ...
    def confirm(self, public_id: UUID, *, idempotency_key: str) \
            -> tuple[Job, bool]: ...
    def retry_local_ingestion(self, public_id: UUID) -> Job: ...
    def abandon_stale(self, older_than_seconds: int = 120) -> int: ...


JobHandler = Callable[[Job, JobProgress], dict[str, Any]]


class JobService:
    def __init__(self, repository: JobStore):
        self.repository = repository
        self.handlers: dict[str, JobHandler] = {}

    def enqueue(self, kind: str, payload: dict[str, Any], **values) \
            -> tuple[Job, bool]:
        return self.repository.enqueue(kind, payload, **values)

    def get(self, public_id: UUID) -> Job | None:
        return self.repository.get(public_id)

    def recent_for_project(self, project_id: int, *, kind: str,
                           limit: int = 8) -> list[Job]:
        return self.repository.recent_for_project(
            project_id, kind=kind, limit=limit)

    def recent_for_workspace(self, workspace_id: int, *, kind: str,
                         limit: int = 8) -> list[Job]:
        return self.repository.recent_for_workspace(
            workspace_id, kind=kind, limit=limit)

    def attach_output_file(self, public_id: UUID, file_id: int) -> bool:
        return self.repository.attach_output_file(public_id, file_id)

    def events(self, public_id: UUID) -> list[dict[str, Any]]:
        return self.repository.events(public_id)

    def cancel(self, public_id: UUID) -> Job | None:
        return self.repository.cancel(public_id)

    def confirm(self, public_id: UUID, *, idempotency_key: str) \
            -> tuple[Job, bool]:
        return self.repository.confirm(
            public_id, idempotency_key=idempotency_key)

    def retry_local_ingestion(self, public_id: UUID) -> Job:
        return self.repository.retry_local_ingestion(public_id)

    def abandon_stale(self, older_than_seconds: int = 120) -> int:
        return self.repository.abandon_stale(older_than_seconds)

    def register(self, kind: str, handler: JobHandler) -> None:
        self.handlers[kind] = handler

    def work_once(self) -> bool:
        job = self.repository.claim_next(self.handlers)
        if not job:
            return False
        stop_pulse = threading.Event()
        pulse = threading.Thread(
            target=self._pulse, args=(job.id, stop_pulse), daemon=True,
            name=f"job-heartbeat-{job.id}")
        pulse.start()
        try:
            result = self.handlers[job.kind](job, self.repository)
            status = "blocked" if result.get("needs_confirmation") else "warning" if result.get("warning") or result.get("failures") else "ok"
            self.repository.finish(job.id, result,
                                   cost=float(result.get("cost") or 0),
                                   usage=result.get("usage") or {},
                                   status=status)
        except JobCancelled:
            pass
        except JobFailed as exc:
            self.repository.fail(
                job.id, str(exc), retry=False, result=exc.result)
        except Exception as exc:
            # Paid provider requests are not blindly retried: a lost response
            # can still have been billed. The operator decides whether to retry.
            self.repository.fail(job.id, f"{type(exc).__name__}: {exc}", retry=False)
        finally:
            stop_pulse.set()
            pulse.join(timeout=2)
        return True

    def _pulse(self, job_id: int, stopping: threading.Event) -> None:
        while not stopping.wait(5):
            try:
                if not self.repository.heartbeat(job_id):
                    return
            except Exception:
                # The handler remains the owner of success/failure. A transient
                # heartbeat failure must not duplicate a paid provider call.
                continue
