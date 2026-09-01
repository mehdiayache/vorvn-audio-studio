"""Public contracts for Spaces, typed Projects and Files."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SpaceResponse(BaseModel):
    id: int
    public_id: str
    name: str
    description: str
    project_count: int = 0
    file_count: int = 0
    folder_count: int = 0
    created_at: str
    updated_at: str


class FolderResponse(BaseModel):
    id: int
    public_id: str
    space_id: int
    parent_id: int | None
    name: str
    created_at: str
    updated_at: str


class ProjectResponse(BaseModel):
    id: int
    public_id: str
    space_id: int
    folder_id: int | None
    project_type: str
    name: str
    description: str
    status: str
    updated_at: str
    file_count: int
    part_count: int


class FileVersionResponse(BaseModel):
    id: int
    public_id: str
    version: int
    filename: str
    storage_key: str
    url: str
    size_bytes: int
    duration_ms: int | None
    mime_type: str
    family: str
    width: int | None
    height: int | None


class FileResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    public_id: str
    space_id: int
    folder_id: int | None
    name: str
    source: str
    tags: list[str]
    metadata: dict[str, Any]
    created_at: str
    updated_at: str
    current_version: FileVersionResponse


class SpaceOverviewResponse(BaseModel):
    space: SpaceResponse
    folders: list[FolderResponse]
    projects: list[ProjectResponse]
    files: list[FileResponse]


class SpaceListEnvelope(BaseModel):
    data: list[SpaceResponse]


class SpaceOverviewEnvelope(BaseModel):
    data: SpaceOverviewResponse


class SpaceCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=2_000)


class FolderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    parent_id: int | None = Field(default=None, gt=0)


class AudiovisualProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=2_000)
    folder_id: int | None = Field(default=None, gt=0)


class SpaceMutationEnvelope(BaseModel):
    data: SpaceResponse


class FolderMutationEnvelope(BaseModel):
    data: FolderResponse


class ProjectMutationEnvelope(BaseModel):
    data: ProjectResponse


class CreationFieldResponse(BaseModel):
    id: str
    label: str
    type: str
    required: bool
    choices: list[str]


class CreationActionResponse(BaseModel):
    id: str
    label: str
    description: str
    inputs: list[CreationFieldResponse]
    parameters: list[CreationFieldResponse]
    output_mime_types: list[str]
    supported_contexts: list[str]
    composer: str | None


class CreationActionListEnvelope(BaseModel):
    data: list[CreationActionResponse]
