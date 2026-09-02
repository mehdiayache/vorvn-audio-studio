"""Public contracts for Workspaces, typed Projects and Files."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class WorkspaceResponse(BaseModel):
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
    workspace_id: int
    parent_id: int | None
    name: str
    created_at: str
    updated_at: str


class ProjectResponse(BaseModel):
    id: int
    public_id: str
    workspace_id: int
    folder_id: int | None
    project_type: str
    name: str
    description: str
    status: str
    updated_at: str
    settings: dict[str, Any] = Field(default_factory=dict)
    file_count: int = 0
    part_count: int = 0


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
    workspace_id: int
    folder_id: int | None
    name: str
    source: str
    tags: list[str]
    metadata: dict[str, Any]
    created_at: str
    updated_at: str
    current_version: FileVersionResponse


class WorkspaceOverviewResponse(BaseModel):
    workspace: WorkspaceResponse
    folders: list[FolderResponse]
    projects: list[ProjectResponse]
    files: list[FileResponse]


class WorkspaceListEnvelope(BaseModel):
    data: list[WorkspaceResponse]


class WorkspaceOverviewEnvelope(BaseModel):
    data: WorkspaceOverviewResponse


class WorkspaceCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=2_000)


class FolderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    parent_id: int | None = Field(default=None, gt=0)


class AudiovisualProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=2_000)
    folder_id: int | None = Field(default=None, gt=0)


class WorkspaceMutationEnvelope(BaseModel):
    data: WorkspaceResponse


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
