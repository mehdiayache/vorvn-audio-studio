"""Versioned Sound Scene API."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from audio_studio.composition.sound_scenes import sound_scene_service
from audio_studio.domain.sound_scene import (
    SoundSceneError,
    SoundSceneRevisionConflict,
)
from audio_studio.http.errors import ApiProblem


router = APIRouter(
    prefix="/api/v1/productions/{production_id}/sound-scene",
    tags=["sound-scene"],
)


class AbsoluteAnchor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["absolute"]
    position_ms: int = Field(ge=0)


class PartAnchor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["part"]
    part_public_id: UUID
    edge: Literal["start", "end"]
    offset_ms: int = 0


SoundSceneAnchor = Annotated[
    AbsoluteAnchor | PartAnchor, Field(discriminator="kind")]


class TelephoneEffect(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    type: Literal["telephone"]
    enabled: bool = True


class EchoEffect(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    type: Literal["echo"]
    enabled: bool = True
    delay_ms: int = Field(default=180, ge=50, le=1_000)
    feedback: float = Field(default=.28, ge=0, le=.85)
    mix: float = Field(default=.22, ge=0, le=1)


SoundSceneEffect = Annotated[
    TelephoneEffect | EchoEffect, Field(discriminator="type")]


class SequenceMixOverride(BaseModel):
    model_config = ConfigDict(extra="forbid")
    muted: bool = False
    gain: float = Field(default=1, ge=0, le=2)
    fade_in_ms: int = Field(default=0, ge=0, le=120_000)
    fade_out_ms: int = Field(default=0, ge=0, le=120_000)
    effects: list[SoundSceneEffect] = Field(default_factory=list, max_length=16)


class SoundSceneClipDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    asset_id: int = Field(gt=0)
    asset_version_id: int | None = Field(default=None, gt=0)
    duration_ms: int | None = Field(default=None, ge=100)
    source_offset_ms: int = Field(default=0, ge=0)
    gain: float = Field(default=1, ge=0, le=2)
    fade_in_ms: int = Field(default=0, ge=0, le=120_000)
    fade_out_ms: int = Field(default=0, ge=0, le=120_000)
    loop: bool = False
    ducking: bool = False
    muted: bool = False
    locked: bool = False
    effects: list[SoundSceneEffect] = Field(default_factory=list, max_length=16)
    anchor: SoundSceneAnchor


class SoundSceneTrackDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    kind: Literal["audio", "music", "sfx", "ambience"]
    name: str = Field(min_length=1, max_length=120)
    volume: float = Field(default=1, ge=0, le=2)
    muted: bool = False
    clips: list[SoundSceneClipDocument] = Field(max_length=1_000)


class SoundSceneDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1]
    sequence_overrides: dict[str, SequenceMixOverride] = Field(
        default_factory=dict, max_length=10_000)
    tracks: list[SoundSceneTrackDocument] = Field(max_length=64)


class SoundSceneUpdateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(gt=0)
    document: SoundSceneDocument


class SequenceProjectionSpan(BaseModel):
    part_id: int
    part_public_id: str
    position: int | None = None
    kind: str
    title: str
    role: str
    voice_name: str
    filename: str
    start_ms: int
    duration_ms: int
    silence: bool
    missing: bool
    mix: SequenceMixOverride
    effect_tail_ms: int = 0


class SequenceProjection(BaseModel):
    signature: str
    duration_ms: int
    sample_rate: Literal[48000]
    spans: list[SequenceProjectionSpan]


class ResolvedSoundSceneClip(SoundSceneClipDocument):
    asset_name: str | None = None
    asset_kind: str | None = None
    filename: str | None = None
    source_duration_ms: int | None = None
    missing: bool | None = None
    resolved_start_ms: int | None = None
    resolved_duration_ms: int
    orphan: bool
    orphan_reason: str | None = None
    effect_tail_ms: int = 0


class ResolvedSoundSceneTrack(BaseModel):
    id: str
    kind: Literal["audio"]
    name: str
    volume: float
    muted: bool
    clips: list[ResolvedSoundSceneClip]


class SoundSceneResolution(BaseModel):
    version: Literal[1]
    signature: str
    # New resolvers always provide the full scene duration. Keeping this
    # nullable at the HTTP boundary lets older persisted/test projections be
    # read while clients fall back to the canonical Sequence duration.
    duration_ms: int | None = None
    sequence_projection: SequenceProjection
    tracks: list[ResolvedSoundSceneTrack]
    orphans: list[dict[str, str]]


class SequenceStemResponse(BaseModel):
    url: str
    filename: str
    duration_ms: int
    signature: str
    cached: bool
    unavailable_reason: str | None = None


class SoundSceneResponse(BaseModel):
    production_id: int
    revision: int
    document: SoundSceneDocument
    can_undo: bool
    can_redo: bool
    updated_at: str
    resolved: SoundSceneResolution
    sequence_stem: SequenceStemResponse


class SoundSceneEnvelope(BaseModel):
    data: SoundSceneResponse


def _run(operation):
    try:
        return {"data": operation()}
    except SoundSceneRevisionConflict as exc:
        raise ApiProblem(409, "sound_scene_revision_conflict", str(exc), {
            "current_revision": exc.current_revision,
        }) from exc
    except (SoundSceneError, ValueError) as exc:
        raise ApiProblem(400, "sound_scene_error", str(exc)) from exc


@router.get("", operation_id="getProductionSoundScene",
            response_model=SoundSceneEnvelope)
def get_sound_scene(production_id: int) -> dict:
    return _run(lambda: sound_scene_service.get(production_id))


@router.patch("", operation_id="updateProductionSoundScene",
              response_model=SoundSceneEnvelope)
def update_sound_scene(
    production_id: int, payload: SoundSceneUpdateBody,
) -> dict:
    return _run(lambda: sound_scene_service.update(
        production_id, payload.expected_revision,
        payload.document.model_dump(),
    ))


@router.post("/undo", operation_id="undoProductionSoundScene",
             response_model=SoundSceneEnvelope)
def undo_sound_scene(production_id: int) -> dict:
    return _run(lambda: sound_scene_service.undo(production_id))


@router.post("/redo", operation_id="redoProductionSoundScene",
             response_model=SoundSceneEnvelope)
def redo_sound_scene(production_id: int) -> dict:
    return _run(lambda: sound_scene_service.redo(production_id))
