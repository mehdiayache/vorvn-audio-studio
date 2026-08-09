"""Job use cases independent of HTTP and worker process lifecycle."""

from __future__ import annotations

from typing import Any, Callable
import threading

from audio_studio.domain.jobs import Job, JobCancelled
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
