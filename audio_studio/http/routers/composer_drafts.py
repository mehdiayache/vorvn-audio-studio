"""Recoverable provider-neutral Composer preparation state."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, model_validator

from audio_studio.application.composer_drafts import ComposerDraftConflict
from audio_studio.composition.composer_drafts import composer_draft_service
from audio_studio.http.errors import ApiProblem


router = APIRouter(prefix="/api/v1/composer-drafts", tags=["composer"])


class StandaloneContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["standalone"]
    session_id: UUID


class ProductionContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["production"]
    production_id: int = Field(gt=0)
    operation: Literal["new_part", "render_draft", "new_take"]
    part_id: int | None = Field(default=None, gt=0)
    insert_before_part_id: UUID | None = None

    @model_validator(mode="after")
    def coherent_target(self):
        if self.operation == "new_part" and self.part_id is not None:
            raise ValueError("A new Part Draft cannot target an existing Part.")
        if self.operation != "new_part" and self.part_id is None:
            raise ValueError("An existing Part Draft needs a Part ID.")
        if self.operation != "new_part" and self.insert_before_part_id:
            raise ValueError("Only a new Part Draft has an insertion point.")
        return self


ComposerContext = Annotated[
    StandaloneContext | ProductionContext, Field(discriminator="kind")]


class RouteState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["owned", "catalogue"]
    binding_id: str | None = None
    catalogue_voice_id: str | None = None
    capability_id: str | None = None

    @model_validator(mode="after")
    def exact_route(self):
        owned = bool(self.binding_id)
        catalogue = bool(self.catalogue_voice_id)
        if self.kind == "owned" and (not owned or catalogue):
            raise ValueError("An owned route needs exactly one Binding ID.")
        if self.kind == "catalogue" and (not catalogue or owned):
            raise ValueError("A catalogue route needs exactly one Catalogue Voice ID.")
        return self


class TextState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    raw: str = ""
    shaped: str = ""
    tagged: str = ""
    active: Literal["raw", "shaped", "tagged"] = "raw"


class TextReviewReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job_id: UUID
    kind: Literal["shape", "tag"]


class TextPreparationState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tag_density: Literal["none", "light", "normal", "heavy"] = "normal"
    pending_review: TextReviewReference | None = None


class DeliveryState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode_id: str | None = None
    instruction: str = ""
    rate: float = Field(default=1, ge=.25, le=4)
    pitch: float = Field(default=1, ge=.25, le=4)
    volume: int = Field(default=50, ge=0, le=100)
    seed: int = 0


class OutputState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    format: Literal["mp3", "wav"] = "mp3"
    language: str = Field(default="Auto", min_length=1, max_length=80)


class ComposerState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    voice_identity_id: str | None = None
    cast_role_id: str | None = None
    route: RouteState | None = None
    text: TextState
    text_preparation: TextPreparationState = Field(
        default_factory=TextPreparationState)
    delivery: DeliveryState
    output: OutputState


class DraftLookup(BaseModel):
    model_config = ConfigDict(extra="forbid")
    context: ComposerContext


class DraftWrite(DraftLookup):
    state: ComposerState
    expected_version: int | None = Field(default=None, ge=0)


class DraftDelete(DraftLookup):
    expected_version: int | None = Field(default=None, ge=1)


class DraftResponse(BaseModel):
    id: UUID
    state: ComposerState
    version: int
    updated_at: datetime


class DraftEnvelope(BaseModel):
    data: DraftResponse | None


class DraftDeleteResponse(BaseModel):
    deleted: bool


class DraftDeleteEnvelope(BaseModel):
    data: DraftDeleteResponse


def _context(payload: DraftLookup) -> dict:
    return payload.context.model_dump(mode="json")


def _state(payload: DraftWrite) -> dict:
    return payload.state.model_dump(mode="json")


def _conflict(operation):
    try:
        return operation()
    except ComposerDraftConflict as exc:
        raise ApiProblem(409, "composer_draft_conflict", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(400, "composer_draft_invalid", str(exc)) from exc


@router.post("/resolve", operation_id="resolveComposerDraft",
             response_model=DraftEnvelope)
def resolve_draft(payload: DraftLookup) -> dict:
    return {"data": _conflict(
        lambda: composer_draft_service.get(_context(payload)))}


@router.put("", operation_id="saveComposerDraft",
            response_model=DraftEnvelope)
def save_draft(payload: DraftWrite) -> dict:
    return {"data": _conflict(lambda: composer_draft_service.put(
        _context(payload), _state(payload), payload.expected_version))}


@router.api_route("", methods=["DELETE"], operation_id="deleteComposerDraft",
                  response_model=DraftDeleteEnvelope)
def delete_draft(payload: DraftDelete) -> dict:
    return {"data": _conflict(lambda: composer_draft_service.delete(
        _context(payload), payload.expected_version))}
