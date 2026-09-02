"""Revisioned Visual Scene API."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from origins.composition.visual_scenes import visual_scene_service
from origins.domain.visual_scene import (
    VisualSceneError,
    VisualSceneRevisionConflict,
)
from origins.http.errors import ApiProblem


router = APIRouter(
    prefix="/api/v1/projects/{project_id}/visual-scene",
    tags=["visual-scene"],
)


class VisualSceneClipDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    file_id: int = Field(gt=0)
    start_ms: int = Field(default=0, ge=0)
    duration_ms: int = Field(ge=100)
    source_offset_ms: int = Field(default=0, ge=0)
    fit: Literal["cover", "contain"] = "cover"
    position_x: float = 0
    position_y: float = 0
    scale: float = Field(default=1, ge=.05, le=10)
    rotation_degrees: float = Field(default=0, ge=-180, le=180)
    flip_horizontal: bool = False
    flip_vertical: bool = False
    opacity: float = Field(default=1, ge=0, le=1)
    locked: bool = False


class VisualSceneTrackDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    media_type: Literal["image", "video"] = "image"
    visible: bool = True
    locked: bool = False
    clips: list[VisualSceneClipDocument] = Field(max_length=1_000)


class VisualSceneCanvasDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    width: int = Field(default=1920, ge=240, le=7680)
    height: int = Field(default=1080, ge=240, le=7680)


class VisualSceneDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1]
    canvas: VisualSceneCanvasDocument = Field(
        default_factory=VisualSceneCanvasDocument)
    tracks: list[VisualSceneTrackDocument] = Field(max_length=64)


class VisualSceneUpdateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(gt=0)
    document: VisualSceneDocument


class VisualSceneResponse(BaseModel):
    project_id: int
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


@router.get("", operation_id="getProjectVisualScene",
            response_model=VisualSceneEnvelope)
def get_visual_scene(project_id: int) -> dict:
    return _run(lambda: visual_scene_service.get(project_id))


@router.patch("", operation_id="updateProjectVisualScene",
              response_model=VisualSceneEnvelope)
def update_visual_scene(
    project_id: int, payload: VisualSceneUpdateBody,
) -> dict:
    return _run(lambda: visual_scene_service.update(
        project_id, payload.expected_revision,
        payload.document.model_dump(mode="json")))
