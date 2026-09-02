"""Small headless contract for serializing and rendering audio scenes."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from origins.application.audio_projects import project_scene
from origins.composition.audio_projects import audio_project_service
from origins.composition.sound_scenes import sound_scene_service
from origins.composition.projects import project_service
from origins.domain.rendering import RenderError
from origins.http.errors import ApiProblem


router = APIRouter(prefix="/api/v1", tags=["audio-projects"])


class ProjectClip(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    start_time: float = Field(ge=0, le=86_400)
    duration: float = Field(gt=0, le=86_400)
    file_url: str = Field(min_length=1, max_length=500)


class ProjectTrack(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    kind: Literal["dialogue", "sfx", "music", "ambience"]
    volume: float = Field(default=1, ge=0, le=2)
    loop: bool = False
    source_offset: float = Field(default=0, ge=0, le=86_400)
    clips: list[ProjectClip] = Field(min_length=1, max_length=1_000)


class AudioProject(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str | None = Field(default=None, max_length=120)
    name: str = Field(default="Untitled Project", min_length=1, max_length=160)
    sample_rate: Literal[48000] = 48000
    tracks: list[ProjectTrack] = Field(min_length=1, max_length=64)


class ProjectEnvelope(BaseModel):
    data: AudioProject


class ProjectRenderResult(BaseModel):
    url: str
    name: str
    duration_ms: int | None
    tracks: int
    clips: int
    sample_rate: Literal[48000]
    channels: Literal[2]
    cached: bool


class ProjectRenderEnvelope(BaseModel):
    data: ProjectRenderResult


def _handle(operation):
    try:
        return {"data": operation()}
    except RenderError as exc:
        raise ApiProblem(422, "audio_project_error", str(exc)) from exc


@router.post("/projects/render", operation_id="renderAudioProject",
             response_model=ProjectRenderEnvelope)
def render_audio_project(payload: AudioProject) -> dict:
    return _handle(lambda: audio_project_service.render(payload.model_dump()))


@router.get("/projects/{project_id}/project-scene",
            operation_id="getProjectScene",
            response_model=ProjectEnvelope)
def get_project_scene(project_id: str) -> dict:
    editor = project_service.project_editor(project_id)
    if not editor:
        raise ApiProblem(404, "project_not_found", "That Project does not exist.")
    return _handle(lambda: project_scene(
        editor, sound_scene_service.get(int(editor["id"]))))
