"""Typed HTTP response contracts for Activity and System operations."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class OutputReference(BaseModel):
    type: str
    id: str | int


class ActivityRunResponse(BaseModel):
    id: str
    internal_id: int
    when: str
    created_at: str
    started_at: str | None
    finished_at: str | None
    kind: str
    kind_label: str
    operation: str
    source_tool: str
    status: str
    model: str | None
    voice: str | None
    detail: str | None
    error: str
    diagnostic_id: str | None
    estimated: float
    cost: float
    chars: int
    seconds: float
    elapsed_ms: int | None
    actor_id: str | None
    actor_label: str
    organization_id: str | None
    provider_request_id: str | None
    provider_region: str | None
    provider_endpoint: str | None
    price_version: str | None
    currency: str
    output_ids: list[OutputReference]
    usage: dict[str, Any]
    provider_diagnostics: list[dict[str, Any]]
    provider_request_ids: list[str]
    provider_attempt_status: str | None = None
    provider_attempt_id: str | None = None
    requires_review: bool = False
    needs_confirmation: bool = False
    review_evidence: dict[str, Any] = Field(default_factory=dict)
    production_id: int | None
    production_name: str | None
    where: str
    cost_basis: str
    cost_basis_raw: str
    children: int
    record_type: str
    event_detail: dict[str, Any] = Field(default_factory=dict)


class ActivityKindResponse(BaseModel):
    kind: str
    runs: int
    cost: float
    problems: int


class ActivityDayResponse(BaseModel):
    day: str
    cost: float
    runs: int


class CostBasisResponse(BaseModel):
    basis: str
    raw_basis: str
    runs: int
    cost: float


class ActivityMediaSpendResponse(BaseModel):
    audio: float
    video: float
    other: float


class ActivitySnapshotResponse(BaseModel):
    today: float
    month: float
    total: float
    today_media: ActivityMediaSpendResponse
    month_media: ActivityMediaSpendResponse
    total_media: ActivityMediaSpendResponse
    runs: int
    problems: int
    running: list[ActivityRunResponse]
    runs_list: list[ActivityRunResponse]
    kinds: dict[str, str]
    by_kind: list[ActivityKindResponse]
    by_day: list[ActivityDayResponse]
    cost_breakdown: list[CostBasisResponse]


class ActivityEnvelope(BaseModel):
    data: ActivitySnapshotResponse


class DatabaseStatusResponse(BaseModel):
    connected: bool
    count: int | None = None
    reason: str | None = None


class WorkerStatusResponse(BaseModel):
    ready: bool
    status: str
    process_id: int | None = None
    started_at: str | None = None
    last_seen_at: str | None = None
    detail: dict[str, Any] | None = None
    expected_runtime_id: str | None = None
    actual_runtime_id: str | None = None


class SystemHealthResponse(BaseModel):
    name: str
    version: str
    status: str
    database: DatabaseStatusResponse
    worker: WorkerStatusResponse


class SystemHealthEnvelope(BaseModel):
    data: SystemHealthResponse
