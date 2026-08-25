"""Native Production timeline API."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from audio_studio.application.timeline import TimelineConflict, TimelineError
from audio_studio.composition.timeline import timeline_service
from audio_studio.http.errors import ApiProblem
from audio_studio.http.production_import_contracts import ProductionImportBody
from audio_studio.http.timeline_contracts import (
    DeletedPartsEnvelope,
    MovedPartsEnvelope,
    OkEnvelope,
    PartCreatedEnvelope,
    TranscriptSummaryListEnvelope,
)
from audio_studio.http.production_import_contracts import ProductionImportEnvelope


router = APIRouter(prefix="/api/v1/productions/{production_id}", tags=["timeline"])


class OrderBody(BaseModel):
    order: list[int]


class SilenceBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seconds: float = Field(ge=.1, le=120)
    insert_before_part_id: str | None = None


class EnabledBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


class AssetBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_id: int = Field(gt=0)
    insert_before_part_id: str | None = None


class ReplaceAssetBody(BaseModel):
    asset_id: int = Field(gt=0)


class DraftBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1)
    text_raw: str | None = None
    text_shaped: str | None = None
    text_tagged: str | None = None
    text_state: str = "raw"
    spoken_profile: Literal["spoken_1", "spoken_2"] = "spoken_1"
    insert_before_part_id: str | None = None
    authored_role: str | None = Field(default=None, max_length=120)
    voice_identity_id: str | None = None
    binding_id: str | None = None
    catalogue_voice_id: str | None = None
    capability_id: str | None = None
    format: str = "mp3"
    language: str = "Auto"
    instruction: str = ""
    speech_mode: str = "exact"
    rate: float = 1
    pitch: float = 1
    volume: int = 50
    seed: int = 0
    enable_ssml: bool = False
    confirmed: bool = False


class MoveBody(BaseModel):
    ids: list[int]
    destination_production_id: int = Field(gt=0)


class DeleteBody(BaseModel):
    ids: list[int]


class TextBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str | None = None
    text_raw: str | None = None
    text_shaped: str | None = None
    text_tagged: str | None = None
    text_state: str | None = None


class EditorialBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1)
    script: str | None = None
    authored_role: str | None = Field(default=None, max_length=120)


def _run(operation):
    try:
        return {"data": operation()}
    except TimelineConflict as exc:
        raise ApiProblem(409, "part_revision_conflict", str(exc), {
            "current_revision": exc.current_revision,
        }) from exc
    except TimelineError as exc:
        raise ApiProblem(400, "timeline_error", str(exc)) from exc


@router.post("/parts/reorder", operation_id="reorderProductionParts",
             response_model=OkEnvelope)
def reorder_parts(production_id: int, payload: OrderBody) -> dict:
    return _run(lambda: {
        "ok": timeline_service.reorder(production_id, payload.order)})


@router.patch("/parts/{part_id}/enabled",
              operation_id="updateProductionPartEnabled",
              response_model=OkEnvelope)
def update_part_enabled(
    production_id: int, part_id: int, payload: EnabledBody,
) -> dict:
    return _run(lambda: timeline_service.set_enabled(
        production_id, part_id, payload.enabled))


@router.post("/parts/silence", operation_id="addProductionSilence",
             response_model=PartCreatedEnvelope,
             response_model_exclude_none=True)
def add_silence(production_id: int, payload: SilenceBody) -> dict:
    return _run(lambda: timeline_service.add_silence(
        production_id, payload.seconds, payload.insert_before_part_id))


@router.post("/parts/drafts", operation_id="addProductionDraft",
             response_model=PartCreatedEnvelope,
             response_model_exclude_none=True)
def add_draft(production_id: int, payload: DraftBody) -> dict:
    return _run(lambda: timeline_service.add_draft(
        production_id, payload.model_dump()))


@router.post("/import", operation_id="importProductionDocument",
             response_model=ProductionImportEnvelope)
def import_production(
    production_id: int, payload: ProductionImportBody,
) -> dict:
    return _run(lambda: timeline_service.import_document(
        production_id, payload.document.model_dump(
            by_alias=True, exclude_none=True),
        payload.role_voices))


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
        production_id, payload.asset_id, payload.insert_before_part_id))


@router.patch("/parts/{part_id}/asset", operation_id="replaceProductionAsset",
              response_model=PartCreatedEnvelope,
              response_model_exclude_none=True)
def replace_asset(production_id: int, part_id: int,
                  payload: ReplaceAssetBody) -> dict:
    return _run(lambda: timeline_service.replace_asset(
        production_id, part_id, payload.asset_id))


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


@router.patch("/parts/{part_id}/draft", operation_id="updateProductionPartDraft",
              response_model=OkEnvelope)
def update_part_text(production_id: int, part_id: int, payload: TextBody) -> dict:
    return _run(lambda: timeline_service.save_draft(
        production_id, part_id, payload.model_dump(exclude_none=False)))


@router.patch("/parts/{part_id}/editorial", operation_id="updateProductionPartEditorial",
              response_model=OkEnvelope)
def update_part_editorial(production_id: int, part_id: int,
                          payload: EditorialBody) -> dict:
    values = payload.model_dump(exclude_unset=True)
    expected_revision = int(values.pop("expected_revision"))
    return _run(lambda: timeline_service.save_editorial(
        production_id, part_id, expected_revision, values))


@router.get("/parts/{part_id}/captions", operation_id="listProductionPartCaptions",
            response_model=TranscriptSummaryListEnvelope)
def list_part_captions(production_id: int, part_id: int) -> dict:
    return _run(lambda: timeline_service.captions(production_id, part_id))
