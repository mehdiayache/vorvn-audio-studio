"""Native Production timeline API."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from audio_studio.application.timeline import TimelineError
from audio_studio.composition.timeline import timeline_service
from audio_studio.http.errors import ApiProblem
from audio_studio.http.timeline_contracts import (
    DeletedPartsEnvelope,
    MovedPartsEnvelope,
    MusicBedEnvelope,
    OkEnvelope,
    PartCreatedEnvelope,
    TakeListEnvelope,
    TranscriptSummaryListEnvelope,
)


router = APIRouter(prefix="/api/v1/productions/{production_id}", tags=["timeline"])


class OrderBody(BaseModel):
    order: list[int]


class SilenceBody(BaseModel):
    seconds: float = Field(ge=.1, le=120)
    insert_at: int | None = None


class AssetBody(BaseModel):
    asset_id: int = Field(gt=0)
    insert_at: int | None = None


class DraftBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1)
    text_raw: str | None = None
    text_shaped: str | None = None
    text_tagged: str | None = None
    text_state: str = "raw"
    insert_at: int | None = None
    voice: str = Field(min_length=1)
    voice_identity_id: str | None = None
    engine: str = "audio"
    model: str = "plus"
    format: str = "mp3"
    language: str = "Auto"
    instruction: str = ""
    speech_mode: str = "exact"
    rate: float = 1
    pitch: float = 1
    volume: int = 50
    seed: int = 0
    confirmed: bool = False


class MoveBody(BaseModel):
    ids: list[int]
    destination_production_id: int = Field(gt=0)


class DeleteBody(BaseModel):
    ids: list[int]


class MusicBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    music_of: int | None = None
    music_level: str | None = None
    music_fade_in: float | None = None
    music_fade_out: float | None = None
    music_duck: bool | None = None
    music_volume: float | None = Field(default=None, ge=0, le=1)
    music_start: float | None = Field(default=None, ge=0)


class TextBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str | None = None
    text_raw: str | None = None
    text_shaped: str | None = None
    text_tagged: str | None = None
    text_state: str | None = None


def _run(operation):
    try:
        return {"data": operation()}
    except TimelineError as exc:
        raise ApiProblem(400, "timeline_error", str(exc)) from exc


@router.get("/music", operation_id="getProductionMusic",
            response_model=MusicBedEnvelope,
            response_model_exclude_none=True)
def get_music(production_id: int) -> dict:
    return _run(lambda: timeline_service.music(production_id))


@router.patch("/music", operation_id="updateProductionMusic",
              response_model=MusicBedEnvelope,
              response_model_exclude_none=True)
def update_music(production_id: int, payload: MusicBody) -> dict:
    return _run(lambda: timeline_service.set_music(
        production_id, payload.model_dump(exclude_unset=True)))


@router.post("/parts/reorder", operation_id="reorderProductionParts",
             response_model=OkEnvelope)
def reorder_parts(production_id: int, payload: OrderBody) -> dict:
    return _run(lambda: {
        "ok": timeline_service.reorder(production_id, payload.order)})


@router.post("/parts/silence", operation_id="addProductionSilence",
             response_model=PartCreatedEnvelope,
             response_model_exclude_none=True)
def add_silence(production_id: int, payload: SilenceBody) -> dict:
    return _run(lambda: timeline_service.add_silence(
        production_id, payload.seconds, payload.insert_at))


@router.post("/parts/drafts", operation_id="addProductionDraft",
             response_model=PartCreatedEnvelope,
             response_model_exclude_none=True)
def add_draft(production_id: int, payload: DraftBody) -> dict:
    return _run(lambda: timeline_service.add_draft(
        production_id, payload.model_dump()))


@router.patch("/parts/{part_id}/silence", operation_id="updateProductionSilence",
              response_model=PartCreatedEnvelope,
              response_model_exclude_none=True)
def update_silence(production_id: int, part_id: int, payload: SilenceBody) -> dict:
    return _run(lambda: timeline_service.edit_silence(
        production_id, part_id, payload.seconds))


@router.post("/parts/assets", operation_id="insertProductionAsset",
             response_model=PartCreatedEnvelope,
             response_model_exclude_none=True)
def insert_asset(production_id: int, payload: AssetBody) -> dict:
    return _run(lambda: timeline_service.insert_asset(
        production_id, payload.asset_id, payload.insert_at))


@router.post("/parts/{part_id}/duplicate", operation_id="duplicateProductionPart",
             response_model=PartCreatedEnvelope,
             response_model_exclude_none=True)
def duplicate_part(production_id: int, part_id: int) -> dict:
    return _run(lambda: timeline_service.duplicate(production_id, part_id))


@router.delete("/parts", operation_id="deleteProductionParts",
               response_model=DeletedPartsEnvelope)
def delete_parts(production_id: int, payload: DeleteBody) -> dict:
    return _run(lambda: timeline_service.delete_parts(production_id, payload.ids))


@router.post("/parts/move", operation_id="moveProductionParts",
             response_model=MovedPartsEnvelope)
def move_parts(production_id: int, payload: MoveBody) -> dict:
    return _run(lambda: timeline_service.move_parts(
        production_id, payload.ids, payload.destination_production_id))


@router.get("/parts/{part_id}/takes", operation_id="listProductionPartTakes",
            response_model=TakeListEnvelope)
def list_takes(production_id: int, part_id: int) -> dict:
    return _run(lambda: timeline_service.takes(production_id, part_id))


@router.post("/parts/{part_id}/takes/{take_id}/promote", operation_id="promoteProductionTake",
             response_model=OkEnvelope)
def promote_take(production_id: int, part_id: int, take_id: int) -> dict:
    return _run(lambda: timeline_service.promote(
        production_id, part_id, take_id))


@router.patch("/parts/{part_id}/text", operation_id="updateProductionPartText",
              response_model=OkEnvelope)
def update_part_text(production_id: int, part_id: int, payload: TextBody) -> dict:
    return _run(lambda: timeline_service.save_text(
        production_id, part_id, payload.model_dump(exclude_none=False)))


@router.get("/parts/{part_id}/captions", operation_id="listProductionPartCaptions",
            response_model=TranscriptSummaryListEnvelope)
def list_part_captions(production_id: int, part_id: int) -> dict:
    return _run(lambda: timeline_service.captions(production_id, part_id))
