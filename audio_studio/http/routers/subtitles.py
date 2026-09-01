"""Native transcript catalogue and derived caption layouts."""

from __future__ import annotations

from fastapi import APIRouter, Query
from audio_studio.composition.subtitles import subtitle_service
from audio_studio.http.errors import ApiProblem
from audio_studio.http.subtitle_contracts import (
    CaptionLayoutEnvelope,
    CaptionProfileKey,
    SubtitleDeletedEnvelope,
    SubtitleEnvelope,
    SubtitleListEnvelope,
)


router = APIRouter(prefix="/api/v1/subtitles", tags=["subtitles"])


@router.get(
    "", operation_id="listSubtitles",
    response_model=SubtitleListEnvelope,
)
def list_subtitles(
    space_id: int = Query(gt=0), limit: int = 40,
) -> dict:
    return {"data": subtitle_service.list(space_id, limit)}


@router.get(
    "/{transcript_id}", operation_id="getSubtitle",
    response_model=SubtitleEnvelope,
)
def get_subtitle(transcript_id: int) -> dict:
    item = subtitle_service.get(transcript_id)
    if not item:
        raise ApiProblem(404, "subtitle_not_found", "That subtitle file no longer exists.")
    return {"data": item}


@router.get(
    "/{transcript_id}/layouts/{profile}", operation_id="getSubtitleLayout",
    response_model=CaptionLayoutEnvelope,
)
def get_subtitle_layout(
    transcript_id: int,
    profile: CaptionProfileKey,
) -> dict:
    """Derive a presentation from saved timings without another provider call."""
    layout = subtitle_service.layout(transcript_id, profile)
    if layout is None:
        raise ApiProblem(404, "subtitle_not_found", "That subtitle file no longer exists.")
    return {"data": layout}


@router.delete(
    "/{transcript_id}", operation_id="deleteSubtitle",
    response_model=SubtitleDeletedEnvelope,
)
def delete_subtitle(transcript_id: int) -> dict:
    if not subtitle_service.delete(transcript_id):
        raise ApiProblem(404, "subtitle_not_found", "That subtitle file no longer exists.")
    return {"data": {"deleted": True}}
