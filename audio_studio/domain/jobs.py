"""Durable Job state shared by API and worker."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    RETRYING = "retrying"
    SUCCEEDED = "ok"
    WARNING = "warning"
    FAILED = "failed"
    BLOCKED = "blocked"
    LOST = "lost"
    CANCELLED = "cancelled"


class JobCancelled(RuntimeError):
    """Cooperative stop raised at a safe Job progress boundary."""


TERMINAL_STATUSES = {JobStatus.SUCCEEDED, JobStatus.WARNING, JobStatus.FAILED,
                     JobStatus.BLOCKED, JobStatus.LOST, JobStatus.CANCELLED}


@dataclass(frozen=True, slots=True)
class Job:
    id: int
    public_id: UUID
    kind: str
    status: JobStatus
    payload: dict[str, Any] = field(default_factory=dict)
    result: dict[str, Any] = field(default_factory=dict)
    progress: float = 0
    detail: str = ""
    error: str = ""
    retries: int = 0
    created_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None

    @property
    def terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES
