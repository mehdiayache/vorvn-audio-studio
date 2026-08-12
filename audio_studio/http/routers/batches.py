"""Native Batch intake endpoints."""

from fastapi import APIRouter, Header, Request

from audio_studio.composition.batches import batch_intake_service
from audio_studio.http.batch_contracts import (
    BatchPreviewEnvelope,
    BatchVoiceValidationEnvelope,
    BatchVoiceValidationRequest,
)
from audio_studio.http.errors import ApiProblem
from audio_studio.http.routers.uploads import _body


router = APIRouter(prefix="/api/v1/batches", tags=["batches"])


@router.post(
    "/preview", operation_id="previewBatch",
    response_model=BatchPreviewEnvelope,
    response_model_exclude_none=True,
)
async def preview_batch(request: Request,
                        x_filename: str = Header(default="sheet.csv")) -> dict:
    try:
        result = batch_intake_service.preview(
            await _body(request, 25_000_000), x_filename)
    except ValueError as exc:
        raise ApiProblem(400, "invalid_batch_file", str(exc)) from exc
    return {"data": result}


@router.post(
    "/validate-voice-column", operation_id="validateBatchVoiceColumn",
    response_model=BatchVoiceValidationEnvelope,
)
def validate_batch_voice_column(payload: BatchVoiceValidationRequest) -> dict:
    try:
        result = batch_intake_service.validate_voice_column(
            payload.token, payload.voice_column)
    except (FileNotFoundError, KeyError, ValueError) as exc:
        raise ApiProblem(400, "invalid_batch_mapping", str(exc)) from exc
    return {"data": result}
