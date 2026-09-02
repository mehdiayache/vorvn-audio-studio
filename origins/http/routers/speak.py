"""Reusable standalone Speak recording history."""

from fastapi import APIRouter, Query

from origins.composition.recording_history import recording_history_service
from origins.http.recording_history_contracts import RecordingHistoryEnvelope


router = APIRouter(prefix="/api/v1/speak", tags=["speak"])


@router.get(
    "/recordings",
    operation_id="getStandaloneRecordingHistory",
    response_model=RecordingHistoryEnvelope,
)
def get_recording_history(
    workspace_id: int = Query(gt=0),
) -> dict:
    return {"data": recording_history_service.get(workspace_id)}
