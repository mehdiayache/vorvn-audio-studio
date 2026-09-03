"""Native bounded upload endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Header, Request
from pathlib import Path
from uuid import uuid4

from origins.config import settings

from origins.application.uploads import (
    MAX_FILE_UPLOAD_BYTES,
    UploadError,
)
from origins.composition.uploads import upload_service
from origins.composition.workspaces import workspace_service
from origins.http.errors import ApiProblem
from origins.http.upload_contracts import (
    UpdateFileBody,
    UploadedFileEnvelope,
    UploadedImageEnvelope,
    UploadedTranscriptionSourceEnvelope,
    UploadedVoiceReferenceEnvelope,
)


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


async def _stream_to_file(request: Request, limit: int) -> tuple[Path, int]:
    raw_length = request.headers.get("content-length")
    if raw_length:
        try:
            length = int(raw_length)
        except ValueError as exc:
            raise ApiProblem(400, "invalid_content_length",
                             "Content-Length is invalid.") from exc
        if length < 0 or length > limit:
            raise ApiProblem(413, "upload_too_large",
                             f"The upload limit is {limit // 1_000_000} MB.")
    root = settings.root / ".incoming"
    root.mkdir(exist_ok=True)
    target = root / f"incoming-{uuid4().hex}.upload"
    size = 0
    try:
        with target.open("wb") as handle:
            async for chunk in request.stream():
                size += len(chunk)
                if size > limit:
                    raise ApiProblem(
                        413, "upload_too_large",
                        f"The upload limit is {limit // 1_000_000} MB.")
                handle.write(chunk)
        return target, size
    except Exception:
        target.unlink(missing_ok=True)
        raise


async def _image(request: Request, filename: str) -> dict:
    try:
        return {"data": upload_service.save_image(
            await _body(request, 8_000_000), filename)}
    except UploadError as exc:
        raise ApiProblem(400, "invalid_image", str(exc)) from exc


@router.post(
    "/production-covers/upload", operation_id="uploadProductionCover",
    response_model=UploadedImageEnvelope,
)
async def upload_production_cover(request: Request,
                               x_filename: str = Header(default="image.png")) -> dict:
    return await _image(request, x_filename)


@router.post(
    "/voice-images/upload", operation_id="uploadVoiceImage",
    response_model=UploadedImageEnvelope,
)
async def upload_voice_image(request: Request,
                             x_filename: str = Header(default="image.png")) -> dict:
    return await _image(request, x_filename)


@router.post(
    "/voice-references/upload", operation_id="uploadVoiceReference",
    response_model=UploadedVoiceReferenceEnvelope,
)
async def upload_voice_reference(request: Request,
                                 x_filename: str = Header(default="reference.wav")) -> dict:
    try:
        return {"data": upload_service.save_voice_reference(
            await _body(request, 100_000_000), x_filename)}
    except UploadError as exc:
        raise ApiProblem(400, "invalid_voice_reference", str(exc)) from exc


@router.post(
    "/workspaces/{workspace_id}/files/upload",
    operation_id="uploadWorkspaceFile",
    status_code=201,
    response_model=UploadedFileEnvelope,
)
async def upload_workspace_file(
    workspace_id: int, request: Request,
    x_filename: str = Header(default="file.txt"),
    x_file_category: str | None = Header(default=None),
    x_file_name: str | None = Header(default=None),
    x_file_tags: str | None = Header(default=None),
    x_folder_id: int | None = Header(default=None, gt=0),
) -> dict:
    try:
        details = upload_service.prepare_file_upload(
            x_filename, name=x_file_name, category=x_file_category,
            encoded_tags=x_file_tags)
    except UploadError as exc:
        raise ApiProblem(400, "invalid_file", str(exc)) from exc
    incoming, size = await _stream_to_file(request, MAX_FILE_UPLOAD_BYTES)
    try:
        result = upload_service.save_workspace_file(
            workspace_id, incoming, size, x_filename, details=details,
            folder_id=x_folder_id)
    except UploadError as exc:
        raise ApiProblem(400, "invalid_file", str(exc)) from exc
    except RuntimeError as exc:
        raise ApiProblem(503, "file_storage_failed", str(exc)) from exc
    finally:
        incoming.unlink(missing_ok=True)
    return {"data": result}


@router.post(
    "/productions/{production_id}/files/upload",
    operation_id="uploadAudiovisualProductionFile",
    status_code=201,
    response_model=UploadedFileEnvelope,
)
async def upload_audiovisual_production_file(
    production_id: int, request: Request,
    x_filename: str = Header(default="media.mp3"),
    x_file_category: str | None = Header(default=None),
    x_file_name: str | None = Header(default=None),
    x_file_tags: str | None = Header(default=None),
) -> dict:
    production = workspace_service.production(str(production_id))
    if not production:
        raise ApiProblem(404, "production_not_found",
                         "Audiovisual Production not found.")
    try:
        details = upload_service.prepare_file_upload(
            x_filename, name=x_file_name, category=x_file_category,
            encoded_tags=x_file_tags)
    except UploadError as exc:
        raise ApiProblem(400, "invalid_file", str(exc)) from exc
    incoming, size = await _stream_to_file(request, MAX_FILE_UPLOAD_BYTES)
    try:
        result = upload_service.save_workspace_file(
            production["workspace_id"], incoming, size, x_filename, details=details,
            folder_id=production.get("folder_id"))
        if not workspace_service.attach_file(production_id, result["id"], "media"):
            raise RuntimeError("The File could not be associated with this Production.")
    except UploadError as exc:
        raise ApiProblem(400, "invalid_file", str(exc)) from exc
    except RuntimeError as exc:
        raise ApiProblem(503, "file_storage_failed", str(exc)) from exc
    finally:
        incoming.unlink(missing_ok=True)
    return {"data": result}


@router.patch(
    "/files/{file_id}", operation_id="updateFile",
    response_model=UploadedFileEnvelope,
)
def update_file(file_id: int, payload: UpdateFileBody) -> dict:
    try:
        updated = upload_service.update_file(
            file_id, name=payload.name, category=payload.category,
            tags=tuple(payload.tags))
    except UploadError as exc:
        status_code = 404 if str(exc) == "That File no longer exists." else 400
        code = "file_not_found" if status_code == 404 else "invalid_file"
        raise ApiProblem(status_code, code, str(exc)) from exc
    return {"data": updated}


@router.post(
    "/subtitles/uploads", operation_id="uploadSubtitleSource",
    response_model=UploadedTranscriptionSourceEnvelope,
)
async def upload_subtitle_source(request: Request,
                                 x_filename: str = Header(default="audio.mp3")) -> dict:
    incoming, size = await _stream_to_file(request, 500_000_000)
    try:
        result = upload_service.save_transcription_source_file(
            incoming, size, x_filename)
    except UploadError as exc:
        raise ApiProblem(400, "invalid_subtitle_source", str(exc),
                         details={"needs_storage": exc.needs_storage}) from exc
    except Exception as exc:
        raise ApiProblem(502, "subtitle_storage_failed",
                         "The audio could not be uploaded to reference storage.") from exc
    finally:
        incoming.unlink(missing_ok=True)
    return {"data": result}
