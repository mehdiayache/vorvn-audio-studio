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


class JobFailed(RuntimeError):
    """Terminal failure whose paid-provider evidence must remain durable."""

    def __init__(self, message: str, result: dict[str, Any] | None = None):
        super().__init__(message)
        self.result = result or {}


class IdempotencyConflict(RuntimeError):
    """One client key was reused for a different operation or payload."""


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
    part_id: int | None = None
    workspace_id: int | None = None
    project_id: int | None = None
    creation_action_id: str | None = None
    creation_preset_id: str | None = None
    creation_context: dict[str, Any] = field(default_factory=dict)
    output_file_ids: tuple[int, ...] = ()

    @property
    def terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES
