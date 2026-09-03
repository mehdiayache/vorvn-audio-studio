"""Public contracts for Workspaces, typed Productions and Files."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from origins.http.file_contracts import WorkspaceFileResponse, WorkspaceFolderResponse


class WorkspaceResponse(BaseModel):
    id: int
    public_id: str
    name: str
    description: str
    production_count: int = 0
    file_count: int = 0
    folder_count: int = 0
    project_count: int = 0
    created_at: str
    updated_at: str


class ProductionResponse(BaseModel):
    id: int
    public_id: str
    workspace_id: int
    folder_id: int | None
    project_id: int | None = None
    production_type: str
    name: str
    description: str
    status: str
    updated_at: str
    settings: dict[str, Any] = Field(default_factory=dict)
    file_count: int = 0
    part_count: int = 0


class WorkspaceOverviewResponse(BaseModel):
    workspace: WorkspaceResponse
    folders: list[WorkspaceFolderResponse]
    projects: list["ProjectResponse"]
    productions: list[ProductionResponse]
    files: list[WorkspaceFileResponse]


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
    project_id: int | None = Field(default=None, gt=0)


class AudiovisualProductionCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=2_000)
    folder_id: int | None = Field(default=None, gt=0)
    project_id: int | None = Field(default=None, gt=0)


class WorkspaceMutationEnvelope(BaseModel):
    data: WorkspaceResponse


class FolderMutationEnvelope(BaseModel):
    data: WorkspaceFolderResponse


class ProductionMutationEnvelope(BaseModel):
    data: ProductionResponse


class ProjectResponse(BaseModel):
    id: int
    public_id: str
    workspace_id: int
    name: str
    description: str
    created_at: str
    updated_at: str
    production_count: int = 0


class ProjectProductionSummaryResponse(BaseModel):
    id: int
    public_id: str
    workspace_id: int
    folder_id: int | None
    project_id: int
    production_type: str
    name: str
    description: str
    status: str
    updated_at: str


class ProjectDetailResponse(ProjectResponse):
    folders: list[WorkspaceFolderResponse]
    productions: list[ProjectProductionSummaryResponse]
    files: list[WorkspaceFileResponse]


class ProjectListEnvelope(BaseModel):
    data: list[ProjectResponse]


class ProjectMutationEnvelope(BaseModel):
    data: ProjectResponse


class ProjectDetailEnvelope(BaseModel):
    data: ProjectDetailResponse


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=2_000)


class ProjectUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = Field(default=None, max_length=2_000)

    def changes(self) -> dict[str, Any]:
        return self.model_dump(exclude_unset=True)


class ProjectDeletedResponse(BaseModel):
    id: int
    type: str
    deleted: bool


class ProjectDeletedEnvelope(BaseModel):
    data: ProjectDeletedResponse


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
    capability_id: str


class CreationActionListEnvelope(BaseModel):
    data: list[CreationActionResponse]
