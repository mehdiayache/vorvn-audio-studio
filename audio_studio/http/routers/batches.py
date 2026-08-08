"""Native Batch intake endpoints."""

from fastapi import APIRouter, Header, Request

from audio_studio.application import batches
from audio_studio.http.errors import ApiProblem
from audio_studio.http.routers.uploads import _body


router = APIRouter(prefix="/api/v1/batches", tags=["batches"])


@router.post("/preview", operation_id="previewBatch")
async def preview_batch(request: Request,
                        x_filename: str = Header(default="sheet.csv")) -> dict:
    try:
        result = batches.preview(await _body(request, 25_000_000), x_filename)
    except ValueError as exc:
        raise ApiProblem(400, "invalid_batch_file", str(exc)) from exc
    return {"data": result}
