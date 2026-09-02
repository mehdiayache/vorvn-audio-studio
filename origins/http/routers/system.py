"""Native system and readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from origins.composition.operations import system_service
from origins.http.operational_contracts import SystemHealthEnvelope


router = APIRouter(prefix="/api/v1/system", tags=["system"])


@router.get(
    "/health", operation_id="getSystemHealth",
    response_model=SystemHealthEnvelope, response_model_exclude_none=True,
)
def health() -> dict:
    return {"data": system_service.health()}
