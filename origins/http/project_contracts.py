"""Public response contracts for audiovisual Projects."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from origins.http.file_contracts import WorkspaceFileResponse, WorkspaceFolderResponse


class WorkspaceFileOwnerResponse(BaseModel):
    id: int
    public_id: str
    name: str
    description: str
    created_at: str
    updated_at: str


class ProjectFileLibraryResponse(BaseModel):
    workspace: WorkspaceFileOwnerResponse
    folders: list[WorkspaceFolderResponse] = Field(default_factory=list)
    files: list[WorkspaceFileResponse]
    project_file_ids: list[int] = Field(default_factory=list)
    library_file_ids: list[int] = Field(default_factory=list)


class ProjectFileLibraryEnvelope(BaseModel):
    data: ProjectFileLibraryResponse


class LibraryFileMutationRequest(BaseModel):
    file_id: int = Field(gt=0)


class LibraryFileMutationResponse(BaseModel):
    file_id: int
    attached: bool


class LibraryFileMutationEnvelope(BaseModel):
    data: LibraryFileMutationResponse


class PartSpeechJobResponse(BaseModel):
    id: str
    type: Literal["speech"] = "speech"
    status: str
    progress: float
    detail: str
    error: str | None = None
    retries: int = 0
    created_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    part_id: int
    result: dict[str, Any] = Field(default_factory=dict)
    request: dict[str, Any] = Field(default_factory=dict)


class PartCaptionJobResponse(BaseModel):
    id: str
    type: Literal["transcribe"] = "transcribe"
    status: str
    progress: float
    detail: str
    error: str | None = None
    retries: int = 0
    created_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    part_id: int
    result: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)


class ProjectPartResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    public_id: str
    created_at: str
    position: int | None
    kind: str
    title: str | None = None
    authored_role: str | None = None
    text: str
    text_raw: str | None = None
    text_shaped: str | None = None
    text_tagged: str | None = None
    text_state: str | None = None
    voice: str | None = None
    voice_name: str | None = None
    clip_public_id: str | None = None
    voice_identity_id: str | None = None
    binding_id: str | None = None
    catalogue_voice_id: str | None = None
    capability_id: str | None = None
    capability_name: str | None = None
    reference_id: str | None = None
    provider: str | None = None
    provider_region: str | None = None
    tier: str | None = None
    provider_attempt_id: str | None = None
    provider_attempt_status: str | None = None
    binding_resolution_status: str | None = None
    clip_raw_text: str | None = None
    clip_spoken_text: str | None = None
    clip_tagged_text: str | None = None
    clip_delivery: dict[str, Any] = Field(default_factory=dict)
    clip_usage: dict[str, Any] = Field(default_factory=dict)
    clip_segmentation: dict[str, Any] = Field(default_factory=dict)
    revision: int = 1
    clip_id: int | None = None
    recording_text_state: str | None = None
    editorial_status: str | None = None
    speech_job: PartSpeechJobResponse | None = None
    caption_job: PartCaptionJobResponse | None = None
    outdated: bool = False
    engine: str | None = None
    model: str | None = None
    format: str | None = None
    language: str | None = None
    instruction: str | None = None
    rate: float | None = None
    pitch: float | None = None
    volume: int | None = None
    seed: int | None = None
    enable_ssml: bool = False
    filename: str | None = None
    size_bytes: int | None = None
    chars: int | None = None
    cost: float
    spent: float | None = None
    duration_ms: int | None = None
    file_of: int | None = None
    file_id: int | None = None
    file_version_id: int | None = None
    file_kind: str | None = None
    file_category: str | None = None
    speech_mode: str | None = None
    cost_basis: str | None = None
    subtitled: bool = False
    subtitles_stale: bool = False
    caption_source_language: str | None = None
    languages: list[str] = Field(default_factory=list)
    missing: bool | None = None


class ProjectExportResponse(BaseModel):
    id: int
    project_id: int
    filename: str
    manifest: dict[str, Any]
    renderer: str
    duration_ms: int | None
    size_bytes: int
    created_at: str


class ProjectAccountingResponse(BaseModel):
    historical_spend: float
    current_sequence_cost: float
    retained_generation_cost: float
    tracked_spend: float
    audio_spend: float = 0.0
    video_spend: float = 0.0
    other_spend: float = 0.0


class ProjectRenderJobResponse(BaseModel):
    id: str
    type: str
    status: Literal[
        "queued", "running", "retrying", "ok", "warning", "failed",
        "blocked", "lost", "cancelled",
    ]
    progress: float
    detail: str
    error: str | None = None
    retries: int
    created_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    result: dict[str, Any] = Field(default_factory=dict)
    part_id: int | None = None


class ProjectEditorResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    public_id: str
    workspace_id: int
    folder_id: int | None = None
    project_type: Literal["audiovisual"] = "audiovisual"
    name: str
    description: str
    status: str
    updated_at: str | None = None
    settings: dict[str, Any]
    parts: list[ProjectPartResponse]
    exports: list[ProjectExportResponse]
    export_job: ProjectRenderJobResponse | None = None
    total_cost: float
    current_sequence_cost: float
    accounting: ProjectAccountingResponse
    total_bytes: int


class ProjectEditorEnvelope(BaseModel):
    data: ProjectEditorResponse


class ArchivedResourceResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    type: Literal["project"] = "project"
    archived: bool | None = None
    deleted: bool | None = None


class ArchivedResourceEnvelope(BaseModel):
    data: ArchivedResourceResponse
