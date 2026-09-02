"""Canonical HTTP contracts for the versioned Project import workflow."""

from __future__ import annotations

from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ImportSpeechItem(BaseModel):
    """Authored speech truth; generation configuration is chosen in Origins."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["speech"]
    role: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=500_000)
    language: str | None = Field(default=None, min_length=1, max_length=80)
    instruction: str = ""


class ImportSilenceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["silence"]
    seconds: float = Field(ge=.1, le=120)


ImportItem = Annotated[
    ImportSpeechItem | ImportSilenceItem,
    Field(discriminator="type"),
]


class ProjectImportDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    schema_name: Literal["origins-project-import"] = Field(alias="schema")
    version: Literal[1]
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2_000)
    language: str | None = Field(default=None, min_length=1, max_length=80)
    items: list[ImportItem] = Field(min_length=1, max_length=1_000)


class ProjectImportBody(BaseModel):
    """Append authored Parts to one existing audiovisual Project."""

    model_config = ConfigDict(extra="forbid")
    document: ProjectImportDocument
    role_voices: dict[str, str]


class ProjectImportValidationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document: ProjectImportDocument


class ProjectImportRoleResponse(BaseModel):
    name: str
    count: int


class ProjectImportSummaryResponse(BaseModel):
    speech: int
    silence: int
    items: int
    roles: list[ProjectImportRoleResponse]
    language: str | None
    estimated_duration_ms: int


class ProjectImportValidationResponse(BaseModel):
    document: ProjectImportDocument
    summary: ProjectImportSummaryResponse


class ProjectImportValidationEnvelope(BaseModel):
    data: ProjectImportValidationResponse


class ProjectImportDestination(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["existing", "new"]
    project_id: int | None = Field(default=None, gt=0)
    workspace_id: int | None = Field(default=None, gt=0)
    folder_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def coherent_target(self):
        if self.kind == "existing":
            if not self.project_id or self.workspace_id or self.folder_id:
                raise ValueError("An existing destination needs only a Project ID.")
        elif self.project_id or not self.workspace_id:
            raise ValueError("A new destination needs a Workspace and optional Folder.")
        return self


class ProjectImportRouteSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    voice_identity_id: str = Field(min_length=1, max_length=120)
    binding_id: str = Field(min_length=1, max_length=120)
    capability_id: str = Field(min_length=1, max_length=120)


class ProjectImportPreparation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text_version: Literal["imported", "spoken_1", "spoken_2"] = "spoken_1"
    tag_density: Literal["none", "light", "normal", "heavy"] = "normal"
    output_format: Literal["mp3", "mp3-24k", "wav", "opus"] = "mp3"
    language: str = Field(min_length=1, max_length=80)


class ProjectImportExecuteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document: ProjectImportDocument
    destination: ProjectImportDestination
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2_000)
    role_routes: dict[str, ProjectImportRouteSelection]
    preparation: ProjectImportPreparation


class ProjectImportResponse(BaseModel):
    items: int
    speech: int
    silence: int


class ProjectImportEnvelope(BaseModel):
    data: ProjectImportResponse
