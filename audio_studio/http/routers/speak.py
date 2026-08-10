"""Standalone Speak session reads."""

from uuid import UUID

from fastapi import APIRouter

from audio_studio.composition.recording_sessions import recording_session_service
from audio_studio.http.recording_contracts import RecordingSessionEnvelope


router = APIRouter(prefix="/api/v1/speak", tags=["speak"])


@router.get(
    "/sessions/{session_id}",
    operation_id="getRecordingSession",
    response_model=RecordingSessionEnvelope,
)
def get_recording_session(session_id: UUID) -> dict:
    return {"data": recording_session_service.get(session_id)}
