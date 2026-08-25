"""Canonical HTTP contracts for the versioned Production import workflow."""

from __future__ import annotations

from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ImportSpeechItem(BaseModel):
    """Authored speech truth plus tolerated V1 legacy generation hints.

    Legacy hints remain readable so existing documents do not break, but the
    import use case never promotes them into a recording route or delivery
    configuration without an explicit operator choice.
    """

    model_config = ConfigDict(extra="forbid")
    type: Literal["speech"]
    role: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=500_000)
    language: str | None = Field(default=None, min_length=1, max_length=80)
    instruction: str = ""
    speech_mode: Literal["exact", "directed"] | None = None
    rate: float | None = Field(default=None, ge=.5, le=2)
    pitch: float | None = Field(default=None, ge=.5, le=2)
    volume: int | None = Field(default=None, ge=0, le=100)
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    format: Literal["mp3", "mp3-24k", "wav", "opus"] | None = None


class ImportSilenceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["silence"]
    seconds: float = Field(ge=.1, le=120)


ImportItem = Annotated[
    ImportSpeechItem | ImportSilenceItem,
    Field(discriminator="type"),
]


class ProductionImportDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    schema_name: Literal["audio-studio-production-import"] = Field(alias="schema")
    version: Literal[1]
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2_000)
    language: str | None = Field(default=None, min_length=1, max_length=80)
    items: list[ImportItem] = Field(min_length=1, max_length=1_000)


class ProductionImportBody(BaseModel):
    """Compatibility shape for the original append-only endpoint."""

    model_config = ConfigDict(extra="forbid")
    document: ProductionImportDocument
    role_voices: dict[str, str]


class ProductionImportValidationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document: ProductionImportDocument


class ProductionImportRoleResponse(BaseModel):
    name: str
    count: int


class ProductionImportSummaryResponse(BaseModel):
    speech: int
    silence: int
    items: int
    roles: list[ProductionImportRoleResponse]
    language: str | None
    estimated_duration_ms: int
    legacy_generation_hints: int


class ProductionImportValidationResponse(BaseModel):
    document: ProductionImportDocument
    summary: ProductionImportSummaryResponse


class ProductionImportValidationEnvelope(BaseModel):
    data: ProductionImportValidationResponse


class ProductionImportDestination(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["existing", "new"]
    production_id: int | None = Field(default=None, gt=0)
    parent_type: Literal["project", "series"] | None = None
    parent_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def coherent_target(self):
        if self.kind == "existing":
            if not self.production_id or self.parent_type or self.parent_id:
                raise ValueError("An existing destination needs only a Production ID.")
        elif self.production_id or not self.parent_type or not self.parent_id:
            raise ValueError("A new destination needs its Project or Series parent.")
        return self


class ProductionImportRouteSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    voice_identity_id: str = Field(min_length=1, max_length=120)
    binding_id: str = Field(min_length=1, max_length=120)
    capability_id: str = Field(min_length=1, max_length=120)


class ProductionImportPreparation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text_version: Literal["imported", "spoken_1", "spoken_2"] = "spoken_1"
    tag_density: Literal["none", "light", "normal", "heavy"] = "normal"
    output_format: Literal["mp3", "mp3-24k", "wav", "opus"] = "mp3"
    language: str = Field(min_length=1, max_length=80)


class ProductionImportExecuteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document: ProductionImportDocument
    destination: ProductionImportDestination
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2_000)
    role_routes: dict[str, ProductionImportRouteSelection]
    preparation: ProductionImportPreparation


class ProductionImportResponse(BaseModel):
    items: int
    speech: int
    silence: int


class ProductionImportEnvelope(BaseModel):
    data: ProductionImportResponse
