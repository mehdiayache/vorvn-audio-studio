"""Native transcript catalogue and derived caption layouts."""

from __future__ import annotations

from fastapi import APIRouter
from pathlib import Path
from typing import Literal

from audio_studio.domain import captions
from audio_studio.http.errors import ApiProblem
from audio_studio.infrastructure.media_paths import media_root
from audio_studio.infrastructure.postgres.transcripts import TranscriptRepository


router = APIRouter(prefix="/api/v1/subtitles", tags=["subtitles"])
repository = TranscriptRepository()


@router.get("", operation_id="listSubtitles")
def list_subtitles(limit: int = 40) -> dict:
    return {"data": repository.list(limit=max(1, min(limit, 200)))}


@router.get("/{transcript_id}", operation_id="getSubtitle")
def get_subtitle(transcript_id: int) -> dict:
    item = repository.get(transcript_id)
    if not item:
        raise ApiProblem(404, "subtitle_not_found", "That subtitle file no longer exists.")
    audio_url = item.get("audio_url")
    if isinstance(audio_url, str) and audio_url.startswith("/audio/"):
        output = media_root()
        candidate = (output / Path(audio_url.removeprefix("/audio/")).name).resolve()
        if candidate.parent != output or not candidate.is_file():
            audio_url = None
    return {"data": {
        "id": item["id"],
        "public_id": item.get("public_id"),
        "file": item.get("name") or "subtitles",
        "url": audio_url,
        "text": item.get("text") or "",
        "srt": item.get("srt") or "",
        "vtt": item.get("vtt") or "",
        "sentences": item.get("sentences") or [],
        "duration_ms": item.get("duration_ms") or 0,
        "language": item.get("language"),
        "created_at": item.get("created_at"),
        "cost": float(item.get("catalog_cost") or 0),
        "cost_basis": item.get("cost_basis") or "unknown",
        "model": item.get("model"),
        "provider_region": item.get("provider_region"),
        "price_version": item.get("price_version"),
        "catalog_rate": float(item.get("catalog_rate") or 0),
        "source_job_id": item.get("source_job_public_id"),
    }}


@router.get("/{transcript_id}/layouts/{profile}", operation_id="getSubtitleLayout")
def get_subtitle_layout(
    transcript_id: int,
    profile: Literal["standard", "short", "words"],
) -> dict:
    """Derive a presentation from saved timings without another provider call."""
    item = repository.get(transcript_id)
    if not item:
        raise ApiProblem(404, "subtitle_not_found", "That subtitle file no longer exists.")
    return {"data": captions.layout(item.get("sentences") or [], profile)}


@router.delete("/{transcript_id}", operation_id="deleteSubtitle")
def delete_subtitle(transcript_id: int) -> dict:
    if not repository.delete(transcript_id):
        raise ApiProblem(404, "subtitle_not_found", "That subtitle file no longer exists.")
    return {"data": {"deleted": True}}
