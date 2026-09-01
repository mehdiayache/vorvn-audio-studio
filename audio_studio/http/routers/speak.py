"""Reusable standalone Speak recording history."""

from fastapi import APIRouter, Query

from audio_studio.composition.recording_history import recording_history_service
from audio_studio.http.recording_history_contracts import RecordingHistoryEnvelope


router = APIRouter(prefix="/api/v1/speak", tags=["speak"])


@router.get(
    "/recordings",
    operation_id="getStandaloneRecordingHistory",
    response_model=RecordingHistoryEnvelope,
)
def get_recording_history(
    space_id: int = Query(gt=0),
) -> dict:
    return {"data": recording_history_service.get(space_id)}
