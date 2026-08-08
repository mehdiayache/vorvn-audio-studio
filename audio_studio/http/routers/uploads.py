"""Native bounded upload endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Header, Request

from audio_studio.application import uploads
from audio_studio.http.errors import ApiProblem


router = APIRouter(prefix="/api/v1", tags=["uploads"])


async def _body(request: Request, limit: int) -> bytes:
    raw_length = request.headers.get("content-length", "0")
    try:
        length = int(raw_length)
    except ValueError as exc:
        raise ApiProblem(400, "invalid_content_length", "Content-Length is invalid.") from exc
    if length < 0 or length > limit:
        raise ApiProblem(413, "upload_too_large", f"The upload limit is {limit // 1_000_000} MB.")
    raw = await request.body()
    if len(raw) > limit:
        raise ApiProblem(413, "upload_too_large", f"The upload limit is {limit // 1_000_000} MB.")
    return raw


async def _image(request: Request, filename: str) -> dict:
    try:
        return {"data": uploads.save_image(await _body(request, 8_000_000), filename)}
    except uploads.UploadError as exc:
        raise ApiProblem(400, "invalid_image", str(exc)) from exc


@router.post("/project-covers/upload", operation_id="uploadProjectCover")
async def upload_project_cover(request: Request,
                               x_filename: str = Header(default="image.png")) -> dict:
    return await _image(request, x_filename)


@router.post("/venture-logos/upload", operation_id="uploadVentureLogo")
async def upload_venture_logo(request: Request,
                              x_filename: str = Header(default="image.png")) -> dict:
    return await _image(request, x_filename)


@router.post("/voice-images/upload", operation_id="uploadVoiceImage")
async def upload_voice_image(request: Request,
                             x_filename: str = Header(default="image.png")) -> dict:
    return await _image(request, x_filename)


@router.post("/voice-references/upload", operation_id="uploadVoiceReference")
async def upload_voice_reference(request: Request,
                                 x_filename: str = Header(default="reference.wav")) -> dict:
    try:
        return {"data": uploads.save_voice_reference(
            await _body(request, 10_000_000), x_filename)}
    except uploads.UploadError as exc:
        raise ApiProblem(400, "invalid_voice_reference", str(exc)) from exc


@router.post("/asset-collections/{collection_id}/assets/upload",
             operation_id="uploadVentureAsset", status_code=201)
async def upload_venture_asset(collection_id: int, request: Request,
                               x_filename: str = Header(default="audio.mp3")) -> dict:
    try:
        result = uploads.save_asset(
            collection_id, await _body(request, 250_000_000), x_filename)
    except uploads.UploadError as exc:
        raise ApiProblem(400, "invalid_asset", str(exc)) from exc
    except RuntimeError as exc:
        raise ApiProblem(503, "asset_storage_failed", str(exc)) from exc
    return {"data": result}


@router.post("/subtitles/uploads", operation_id="uploadSubtitleSource")
async def upload_subtitle_source(request: Request,
                                 x_filename: str = Header(default="audio.mp3")) -> dict:
    try:
        result = uploads.save_transcription_source(
            await _body(request, 500_000_000), x_filename)
    except uploads.UploadError as exc:
        raise ApiProblem(400, "invalid_subtitle_source", str(exc),
                         details={"needs_storage": exc.needs_storage}) from exc
    except Exception as exc:
        raise ApiProblem(502, "subtitle_storage_failed",
                         "The audio could not be uploaded to reference storage.") from exc
    return {"data": result}
