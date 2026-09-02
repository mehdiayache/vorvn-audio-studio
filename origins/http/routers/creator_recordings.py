"""Reusable standalone speech history for the canonical Creator."""

from fastapi import APIRouter, Query

from origins.composition.recording_history import recording_history_service
from origins.http.recording_history_contracts import RecordingHistoryEnvelope


router = APIRouter(prefix="/api/v1/creator", tags=["Creator"])


@router.get(
    "/recordings",
    operation_id="getCreatorRecordingHistory",
    response_model=RecordingHistoryEnvelope,
)
def get_recording_history(
    workspace_id: int = Query(gt=0),
) -> dict:
    return {"data": recording_history_service.get(workspace_id)}
