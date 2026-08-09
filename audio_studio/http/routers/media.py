"""Native browser media delivery with seek/range support from Starlette."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from audio_studio.composition.media import media_service
from audio_studio.domain.media import MediaFile


router = APIRouter(tags=["media"])


def _response(item: MediaFile | None) -> FileResponse:
    if item is None:
        raise HTTPException(status_code=404, detail="Media file not found")
    return FileResponse(item.path, filename=item.download_name)


@router.api_route("/audio/{name}", methods=["GET", "HEAD"], include_in_schema=False)
def get_audio(name: str) -> FileResponse:
    return _response(media_service.resolve("audio", name))


@router.api_route("/icon/{name}", methods=["GET", "HEAD"], include_in_schema=False)
def get_icon(name: str) -> FileResponse:
    return _response(media_service.resolve("icon", name))


@router.api_route("/inbox/{name}", methods=["GET", "HEAD"], include_in_schema=False)
def get_inbox_file(name: str) -> FileResponse:
    return _response(media_service.resolve("inbox", name))


@router.api_route("/block-audio/{name}", methods=["GET", "HEAD"], include_in_schema=False)
def get_block_audio(name: str) -> FileResponse:
    return _response(media_service.resolve("block-audio", name))


@router.api_route("/samples/{name}", methods=["GET", "HEAD"], include_in_schema=False)
def get_sample(name: str) -> FileResponse:
    return _response(media_service.resolve("samples", name))


@router.api_route("/batch-audio/{folder}/{name}", methods=["GET", "HEAD"],
                  include_in_schema=False)
def get_batch_media(folder: str, name: str) -> FileResponse:
    return _response(media_service.resolve("batch-audio", name, folder))


@router.get("/api/v1/exports/{export_id}/download", operation_id="downloadExport")
def download_export(export_id: int) -> FileResponse:
    return _response(media_service.export_file(export_id))


@router.get("/api/v1/generations/{generation_id}/download",
            operation_id="downloadGeneration")
def download_generation(generation_id: int) -> FileResponse:
    return _response(media_service.generation_file(generation_id))
