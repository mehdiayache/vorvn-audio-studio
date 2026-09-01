"""Native bounded upload endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Header, Request
from pathlib import Path
from uuid import uuid4

from audio_studio.config import settings

from audio_studio.application.uploads import MAX_ASSET_UPLOAD_BYTES, UploadError
from audio_studio.composition.uploads import upload_service
from audio_studio.composition.spaces import space_service
from audio_studio.http.errors import ApiProblem
from audio_studio.http.upload_contracts import (
    UpdateAssetBody,
    UploadedAssetEnvelope,
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
    "/project-covers/upload", operation_id="uploadProjectCover",
    response_model=UploadedImageEnvelope,
)
async def upload_project_cover(request: Request,
                               x_filename: str = Header(default="image.png")) -> dict:
    return await _image(request, x_filename)


@router.post(
    "/venture-logos/upload", operation_id="uploadVentureLogo",
    response_model=UploadedImageEnvelope,
)
async def upload_venture_logo(request: Request,
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


@router.post("/asset-collections/{collection_id}/assets/upload",
             operation_id="uploadVentureAsset", status_code=201,
             response_model=UploadedAssetEnvelope)
async def upload_venture_asset(collection_id: int, request: Request,
                               x_filename: str = Header(default="audio.mp3"),
                               x_asset_category: str | None = Header(
                                   default=None),
                               x_asset_name: str | None = Header(default=None),
                               x_asset_scope: str | None = Header(default=None),
                               x_asset_tags: str | None = Header(default=None)) -> dict:
    try:
        details = upload_service.prepare_asset_upload(
            x_filename, name=x_asset_name, category=x_asset_category,
            scope=x_asset_scope, encoded_tags=x_asset_tags)
    except UploadError as exc:
        raise ApiProblem(400, "invalid_asset", str(exc)) from exc
    incoming, size = await _stream_to_file(request, MAX_ASSET_UPLOAD_BYTES)
    try:
        result = upload_service.save_asset_file(
            collection_id, incoming, size, x_filename, details=details)
    except UploadError as exc:
        raise ApiProblem(400, "invalid_asset", str(exc)) from exc
    except RuntimeError as exc:
        raise ApiProblem(503, "asset_storage_failed", str(exc)) from exc
    finally:
        incoming.unlink(missing_ok=True)
    return {"data": result}


@router.post(
    "/spaces/{space_id}/files/upload",
    operation_id="uploadSpaceFile",
    status_code=201,
    response_model=UploadedAssetEnvelope,
)
async def upload_space_file(
    space_id: int, request: Request,
    x_filename: str = Header(default="media.mp3"),
    x_asset_category: str | None = Header(default=None),
    x_asset_name: str | None = Header(default=None),
    x_asset_tags: str | None = Header(default=None),
) -> dict:
    try:
        details = upload_service.prepare_asset_upload(
            x_filename, name=x_asset_name, category=x_asset_category,
            scope="space", encoded_tags=x_asset_tags)
    except UploadError as exc:
        raise ApiProblem(400, "invalid_file", str(exc)) from exc
    incoming, size = await _stream_to_file(request, MAX_ASSET_UPLOAD_BYTES)
    try:
        result = upload_service.save_space_file(
            space_id, incoming, size, x_filename, details=details)
    except UploadError as exc:
        raise ApiProblem(400, "invalid_file", str(exc)) from exc
    except RuntimeError as exc:
        raise ApiProblem(503, "file_storage_failed", str(exc)) from exc
    finally:
        incoming.unlink(missing_ok=True)
    return {"data": result}


@router.post(
    "/audiovisual-projects/{project_id}/files/upload",
    operation_id="uploadAudiovisualProjectFile",
    status_code=201,
    response_model=UploadedAssetEnvelope,
)
async def upload_audiovisual_project_file(
    project_id: int, request: Request,
    x_filename: str = Header(default="media.mp3"),
    x_asset_category: str | None = Header(default=None),
    x_asset_name: str | None = Header(default=None),
    x_asset_tags: str | None = Header(default=None),
) -> dict:
    project = space_service.project(str(project_id))
    if not project:
        raise ApiProblem(404, "project_not_found",
                         "Audiovisual Project not found.")
    try:
        details = upload_service.prepare_asset_upload(
            x_filename, name=x_asset_name, category=x_asset_category,
            scope="space", encoded_tags=x_asset_tags)
    except UploadError as exc:
        raise ApiProblem(400, "invalid_file", str(exc)) from exc
    incoming, size = await _stream_to_file(request, MAX_ASSET_UPLOAD_BYTES)
    try:
        result = upload_service.save_space_file(
            project["space_id"], incoming, size, x_filename, details=details)
        if not space_service.attach_file(project_id, result["id"], "media"):
            raise RuntimeError("The File could not be associated with this Project.")
    except UploadError as exc:
        raise ApiProblem(400, "invalid_file", str(exc)) from exc
    except RuntimeError as exc:
        raise ApiProblem(503, "file_storage_failed", str(exc)) from exc
    finally:
        incoming.unlink(missing_ok=True)
    return {"data": result}


@router.patch(
    "/assets/{asset_id}", operation_id="updateAsset",
    response_model=UploadedAssetEnvelope,
)
def update_asset(asset_id: int, payload: UpdateAssetBody) -> dict:
    try:
        updated = upload_service.update_asset(
            asset_id, name=payload.name, category=payload.category,
            scope=payload.scope, tags=tuple(payload.tags))
    except UploadError as exc:
        status_code = 404 if str(exc) == "That Asset no longer exists." else 400
        code = "asset_not_found" if status_code == 404 else "invalid_asset"
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
