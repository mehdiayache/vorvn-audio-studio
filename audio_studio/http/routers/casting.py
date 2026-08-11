"""Character library and minimal Production Cast API."""

from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, model_validator

from audio_studio.composition.casting import cast_service


router = APIRouter(prefix="/api/v1", tags=["casting"])


class PersonaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    image: str = Field(default="", max_length=1000)
    description: str = Field(default="", max_length=5000)
    aliases: list[str] = Field(default_factory=list, max_length=100)
    notes: str = Field(default="", max_length=20_000)
    presentation: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class VoiceAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    voice_source_kind: Literal["identity", "catalogue"]
    voice_identity_id: str | None = Field(default=None, max_length=200)
    catalogue_voice_id: str | None = Field(default=None, max_length=700)

    @model_validator(mode="after")
    def exact_assignment(self):
        if self.voice_source_kind == "identity" and self.voice_identity_id and not self.catalogue_voice_id:
            return self
        if self.voice_source_kind == "catalogue" and self.catalogue_voice_id and not self.voice_identity_id:
            return self
        raise ValueError("Choose exactly one Voice Identity or catalogue voice.")


class CastRoleCreate(VoiceAssignment):
    name: str = Field(min_length=1, max_length=200)
    persona_id: str | None = None
    color: str = Field(default="", max_length=40)
    position: int | None = Field(default=None, ge=0)


class ListEnvelope(BaseModel):
    data: list[dict[str, Any]]


class ItemEnvelope(BaseModel):
    data: dict[str, Any]


@router.get("/ventures/{venture_id}/personas", response_model=ListEnvelope)
def list_personas(venture_id: str):
    return {"data": cast_service.personas(venture_id)}


@router.post("/ventures/{venture_id}/personas", response_model=ItemEnvelope,
             status_code=201)
def create_persona(venture_id: str, payload: PersonaCreate):
    return {"data": cast_service.create_persona(venture_id, payload.model_dump())}


@router.get("/productions/{production_id}/cast", response_model=ListEnvelope)
def production_cast(production_id: str):
    return {"data": cast_service.cast(production_id)}


@router.post("/productions/{production_id}/cast", response_model=ItemEnvelope,
             status_code=201)
def create_cast_role(production_id: str, payload: CastRoleCreate):
    return {"data": cast_service.create_role(production_id, payload.model_dump())}


@router.patch("/cast-roles/{role_id}/assignment", response_model=ItemEnvelope)
def recast(role_id: str, payload: VoiceAssignment):
    return {"data": cast_service.recast(role_id, payload.model_dump())}
