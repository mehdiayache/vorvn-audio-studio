"""Native operational ledger API for the React Activity surface."""

from __future__ import annotations

from fastapi import APIRouter, Query

from origins.composition.operations import activity_service
from origins.http.operational_contracts import ActivityEnvelope


router = APIRouter(prefix="/api/v1/activity", tags=["activity"])


@router.get("", operation_id="getActivity", response_model=ActivityEnvelope)
def activity(limit: int = Query(80, ge=1, le=200), kind: str = "",
             failed: bool = False) -> dict:
    return {"data": activity_service.snapshot(limit=limit, kind=kind,
                                                failed_only=failed)}
