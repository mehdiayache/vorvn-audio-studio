"""Native Production timeline API."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from audio_studio.application import timeline
from audio_studio.http.errors import ApiProblem
from audio_studio.infrastructure.postgres.transcripts import TranscriptRepository


router = APIRouter(prefix="/api/v1/productions/{production_id}", tags=["timeline"])
transcripts = TranscriptRepository()


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
    except timeline.TimelineError as exc:
        raise ApiProblem(400, "timeline_error", str(exc)) from exc


@router.get("/music", operation_id="getProductionMusic")
def get_music(production_id: int) -> dict:
    return _run(lambda: timeline.music(production_id))


@router.patch("/music", operation_id="updateProductionMusic")
def update_music(production_id: int, payload: MusicBody) -> dict:
    return _run(lambda: timeline.set_music(
        production_id, payload.model_dump(exclude_unset=True)))


@router.post("/parts/reorder", operation_id="reorderProductionParts")
def reorder_parts(production_id: int, payload: OrderBody) -> dict:
    return _run(lambda: {"ok": timeline.reorder(production_id, payload.order)})


@router.post("/parts/silence", operation_id="addProductionSilence")
def add_silence(production_id: int, payload: SilenceBody) -> dict:
    return _run(lambda: timeline.add_silence(production_id, payload.seconds, payload.insert_at))


@router.post("/parts/drafts", operation_id="addProductionDraft")
def add_draft(production_id: int, payload: DraftBody) -> dict:
    return _run(lambda: timeline.add_draft(production_id, payload.model_dump()))


@router.patch("/parts/{part_id}/silence", operation_id="updateProductionSilence")
def update_silence(production_id: int, part_id: int, payload: SilenceBody) -> dict:
    return _run(lambda: timeline.edit_silence(production_id, part_id, payload.seconds))


@router.post("/parts/assets", operation_id="insertProductionAsset")
def insert_asset(production_id: int, payload: AssetBody) -> dict:
    return _run(lambda: timeline.insert_asset(production_id, payload.asset_id, payload.insert_at))


@router.post("/parts/{part_id}/duplicate", operation_id="duplicateProductionPart")
def duplicate_part(production_id: int, part_id: int) -> dict:
    return _run(lambda: timeline.duplicate(production_id, part_id))


@router.delete("/parts", operation_id="deleteProductionParts")
def delete_parts(production_id: int, payload: DeleteBody) -> dict:
    return _run(lambda: timeline.delete_parts(production_id, payload.ids))


@router.post("/parts/move", operation_id="moveProductionParts")
def move_parts(production_id: int, payload: MoveBody) -> dict:
    return _run(lambda: timeline.move_parts(production_id, payload.ids, payload.destination_production_id))


@router.get("/parts/{part_id}/takes", operation_id="listProductionPartTakes")
def list_takes(production_id: int, part_id: int) -> dict:
    return _run(lambda: timeline.takes(production_id, part_id))


@router.post("/parts/{part_id}/takes/{take_id}/promote", operation_id="promoteProductionTake")
def promote_take(production_id: int, part_id: int, take_id: int) -> dict:
    return _run(lambda: timeline.promote(
        production_id, part_id, take_id, transcripts))


@router.patch("/parts/{part_id}/text", operation_id="updateProductionPartText")
def update_part_text(production_id: int, part_id: int, payload: TextBody) -> dict:
    return _run(lambda: timeline.save_text(production_id, part_id, payload.model_dump(exclude_none=False)))


@router.get("/parts/{part_id}/captions", operation_id="listProductionPartCaptions")
def list_part_captions(production_id: int, part_id: int) -> dict:
    return _run(lambda: timeline.captions(production_id, part_id, transcripts))
