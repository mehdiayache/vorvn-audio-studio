"""Small headless contract for serializing and rendering audio scenes."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from origins.application.audio_productions import production_scene
from origins.composition.audio_productions import audio_production_service
from origins.composition.sound_scenes import sound_scene_service
from origins.composition.productions import production_service
from origins.domain.rendering import RenderError
from origins.http.errors import ApiProblem


router = APIRouter(prefix="/api/v1", tags=["audio-productions"])


class ProductionClip(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    start_time: float = Field(ge=0, le=86_400)
    duration: float = Field(gt=0, le=86_400)
    file_url: str = Field(min_length=1, max_length=500)


class ProductionTrack(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    kind: Literal["dialogue", "sfx", "music", "ambience"]
    volume: float = Field(default=1, ge=0, le=2)
    loop: bool = False
    source_offset: float = Field(default=0, ge=0, le=86_400)
    clips: list[ProductionClip] = Field(min_length=1, max_length=1_000)


class AudioProduction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str | None = Field(default=None, max_length=120)
    name: str = Field(default="Untitled Production", min_length=1, max_length=160)
    sample_rate: Literal[48000] = 48000
    tracks: list[ProductionTrack] = Field(min_length=1, max_length=64)


class ProductionEnvelope(BaseModel):
    data: AudioProduction


class ProductionRenderResult(BaseModel):
    url: str
    name: str
    duration_ms: int | None
    tracks: int
    clips: int
    sample_rate: Literal[48000]
    channels: Literal[2]
    cached: bool


class ProductionRenderEnvelope(BaseModel):
    data: ProductionRenderResult


def _handle(operation):
    try:
        return {"data": operation()}
    except RenderError as exc:
        raise ApiProblem(422, "audio_production_error", str(exc)) from exc


@router.post("/productions/render", operation_id="renderAudioProduction",
             response_model=ProductionRenderEnvelope)
def render_audio_production(payload: AudioProduction) -> dict:
    return _handle(lambda: audio_production_service.render(payload.model_dump()))


@router.get("/productions/{production_id}/production-scene",
            operation_id="getProductionScene",
            response_model=ProductionEnvelope)
def get_production_scene(production_id: str) -> dict:
    editor = production_service.production_editor(production_id)
    if not editor:
        raise ApiProblem(404, "production_not_found", "That Production does not exist.")
    return _handle(lambda: production_scene(
        editor, sound_scene_service.get(int(editor["id"]))))
