"""Native operational ledger API for the React Activity surface."""

from __future__ import annotations

from fastapi import APIRouter, Query

import db
from audio_studio.application import activity as activity_service


router = APIRouter(prefix="/api/v1/activity", tags=["activity"])


@router.get("", operation_id="getActivity")
def activity(limit: int = Query(80, ge=1, le=200), kind: str = "",
             failed: bool = False) -> dict:
    db.jobs_abandon_stale()
    return {"data": activity_service.snapshot(limit=limit, kind=kind,
                                                failed_only=failed)}
