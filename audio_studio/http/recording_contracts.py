"""Typed contracts for standalone Speak recording sessions."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class RecordingAttemptResponse(BaseModel):
    id: str
    status: str
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    request: dict[str, Any]
    error: str
    warning: str
    cost: float
    cost_basis: str
    duration_ms: int
    size_bytes: int
    audio_url: str | None
    fidelity: dict[str, Any] | None
    needs_confirmation: bool = False
    requires_review: bool = False
    estimate: float = 0
    continued_by_job_id: str | None = None


class RecordingSessionResponse(BaseModel):
    id: str
    attempts: list[RecordingAttemptResponse]
    total_cost: float


class RecordingSessionEnvelope(BaseModel):
    data: RecordingSessionResponse
