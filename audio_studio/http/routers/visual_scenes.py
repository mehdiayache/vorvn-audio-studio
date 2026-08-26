"""Revisioned Visual Scene API."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from audio_studio.composition.visual_scenes import visual_scene_service
from audio_studio.domain.visual_scene import (
    VisualSceneError,
    VisualSceneRevisionConflict,
)
from audio_studio.http.errors import ApiProblem


router = APIRouter(
    prefix="/api/v1/productions/{production_id}/visual-scene",
    tags=["visual-scene"],
)


class VisualSceneClipDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    asset_id: int = Field(gt=0)
    start_ms: int = Field(default=0, ge=0)
    duration_ms: int = Field(ge=100)
    source_offset_ms: int = Field(default=0, ge=0)
    locked: bool = False


class VisualSceneTrackDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    visible: bool = True
    locked: bool = False
    clips: list[VisualSceneClipDocument] = Field(max_length=1_000)


class VisualSceneDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1]
    tracks: list[VisualSceneTrackDocument] = Field(max_length=64)


class VisualSceneUpdateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(gt=0)
    document: VisualSceneDocument


class VisualSceneResponse(BaseModel):
    production_id: int
    revision: int
    document: VisualSceneDocument
    updated_at: str


class VisualSceneEnvelope(BaseModel):
    data: VisualSceneResponse


def _run(operation):
    try:
        return {"data": operation()}
    except VisualSceneRevisionConflict as exc:
        raise ApiProblem(409, "visual_scene_revision_conflict", str(exc), {
            "current_revision": exc.current_revision,
        }) from exc
    except (VisualSceneError, ValueError) as exc:
        raise ApiProblem(400, "visual_scene_error", str(exc)) from exc


@router.get("", operation_id="getProductionVisualScene",
            response_model=VisualSceneEnvelope)
def get_visual_scene(production_id: int) -> dict:
    return _run(lambda: visual_scene_service.get(production_id))


@router.patch("", operation_id="updateProductionVisualScene",
              response_model=VisualSceneEnvelope)
def update_visual_scene(
    production_id: int, payload: VisualSceneUpdateBody,
) -> dict:
    return _run(lambda: visual_scene_service.update(
        production_id, payload.expected_revision,
        payload.document.model_dump(mode="json")))
