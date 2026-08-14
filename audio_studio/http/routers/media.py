"""Native browser media delivery with seek/range support from Starlette."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from audio_studio.composition.media import media_service
from audio_studio.composition.waveforms import waveform_peaks
from audio_studio.domain.media import MediaFile


router = APIRouter(tags=["media"])


class AudioPeaksResponse(BaseModel):
    filename: str
    bars: int
    peaks: list[float]


class AudioPeaksEnvelope(BaseModel):
    data: AudioPeaksResponse


def _response(item: MediaFile | None) -> FileResponse:
    if item is None:
        raise HTTPException(status_code=404, detail="Media file not found")
    return FileResponse(item.path, filename=item.download_name)


@router.api_route("/audio/{name}", methods=["GET", "HEAD"], include_in_schema=False)
def get_audio(name: str) -> FileResponse:
    return _response(media_service.resolve("audio", name))


@router.get("/api/v1/media/peaks/{name}", operation_id="getAudioPeaks",
            response_model=AudioPeaksEnvelope)
def get_audio_peaks(name: str, bars: int = Query(48, ge=8, le=512)) -> dict:
    try:
        values = waveform_peaks(name, bars)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"data": {"filename": name, "bars": len(values), "peaks": values}}


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


@router.get("/api/v1/exports/{export_id}/download", operation_id="downloadExport",
            response_class=FileResponse)
def download_export(export_id: int) -> FileResponse:
    return _response(media_service.export_file(export_id))


@router.get("/api/v1/recordings/{recording_id}/download",
            operation_id="downloadRecording", response_class=FileResponse)
def download_recording(recording_id: int) -> FileResponse:
    return _response(media_service.recording_file(recording_id))
