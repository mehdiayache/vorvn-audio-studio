"""Public response contracts for the canonical Work hierarchy."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class HierarchyMetricsResponse(BaseModel):
    parts: int
    cost: float


class SummaryMetricsResponse(BaseModel):
    production_count: int
    part_count: int
    duration_ms: int
    total_cost: float
    current_sequence_cost: float


class ProjectOverviewMetricsResponse(SummaryMetricsResponse):
    series_count: int
    standalone_count: int


class SeriesOverviewMetricsResponse(SummaryMetricsResponse):
    pass


class TrailItemResponse(BaseModel):
    id: int
    public_id: str
    type: Literal["venture", "project", "series"]
    name: str
    icon: str | None = None


class HierarchyNodeResponse(BaseModel):
    key: str
    id: int
    public_id: str
    type: Literal["venture", "project", "series", "production"]
    parent_key: str | None
    name: str
    description: str
    icon: str
    updated_at: str | None = None
    locked: bool
    system_role: str | None = None
    metrics: HierarchyMetricsResponse
    children: list["HierarchyNodeResponse"] | None = None


class PaginationMetaResponse(BaseModel):
    count: int
    total: int
    next_cursor: str | None


class HierarchyPageEnvelope(BaseModel):
    data: list[HierarchyNodeResponse]
    meta: PaginationMetaResponse


class WorkResourceResponse(BaseModel):
    """The shared identity fields returned by any Work resource."""

    model_config = ConfigDict(extra="allow")

    id: int
    public_id: str
    type: Literal["venture", "project", "series", "production"]
    key: str
    name: str
    description: str
    icon: str | None = None
    parent_key: str | None = None
    cover_image: str | None = None
    updated_at: str | None = None
    locked: bool | None = None
    system_role: str | None = None
    project_id: int | None = None
    series_id: int | None = None
    status: str | None = None
    settings: dict[str, Any] | None = None
    trail: list[TrailItemResponse] | None = None
    metrics: HierarchyMetricsResponse | None = None
    children: list[HierarchyNodeResponse] | None = None


class WorkResourceEnvelope(BaseModel):
    data: WorkResourceResponse


class OverviewResourceResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    public_id: str
    type: Literal["venture", "project", "series"]
    key: str
    name: str
    description: str
    icon: str
    updated_at: str | None = None
    locked: bool | None = None


class ResourceMutationResponse(BaseModel):
    """A command acknowledgement; callers reload the canonical resource."""

    model_config = ConfigDict(extra="allow")

    id: int
    type: Literal["venture", "project", "series", "production"]
    name: str | None = None
    parent_key: str | None = None
    public_id: str | None = None
    key: str | None = None
    description: str | None = None


class ResourceMutationEnvelope(BaseModel):
    data: ResourceMutationResponse


class ProjectSummaryResponse(BaseModel):
    id: int
    public_id: str
    type: Literal["project"] = "project"
    key: str
    name: str
    description: str
    cover_image: str
    updated_at: str | None = None
    metrics: SummaryMetricsResponse


class SeriesSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    public_id: str
    type: Literal["series"] = "series"
    key: str
    name: str
    description: str
    icon: str = ""
    defaults: dict[str, Any]
    updated_at: str | None = None
    metrics: SummaryMetricsResponse


class ProductionSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    public_id: str
    type: Literal["production"] = "production"
    key: str
    name: str
    description: str
    status: str
    series_id: int | None
    part_count: int
    duration_ms: int
    total_cost: float
    current_sequence_cost: float
    updated_at: str | None = None


class ProjectSeriesSummaryResponse(SeriesSummaryResponse):
    productions: list[ProductionSummaryResponse] = Field(default_factory=list)


class AssetKindSummaryResponse(BaseModel):
    collection_id: int
    name: str
    count: int
    duration_ms: int


class AssetSummaryResponse(BaseModel):
    total: int
    duration_ms: int
    by_kind: dict[str, AssetKindSummaryResponse]


class VentureOverviewResponse(BaseModel):
    resource: OverviewResourceResponse
    trail: list[TrailItemResponse]
    projects: list[ProjectSummaryResponse]
    asset_summary: AssetSummaryResponse
    recent_productions: list[ProductionSummaryResponse]


class VentureOverviewEnvelope(BaseModel):
    data: VentureOverviewResponse


class ProjectOverviewResponse(BaseModel):
    resource: OverviewResourceResponse
    trail: list[TrailItemResponse]
    series: list[ProjectSeriesSummaryResponse]
    standalone_productions: list[ProductionSummaryResponse]
    metrics: ProjectOverviewMetricsResponse


class ProjectOverviewEnvelope(BaseModel):
    data: ProjectOverviewResponse


class SeriesOverviewResponse(BaseModel):
    resource: OverviewResourceResponse
    trail: list[TrailItemResponse]
    defaults: dict[str, Any]
    productions: list[ProductionSummaryResponse]
    metrics: SeriesOverviewMetricsResponse


class SeriesOverviewEnvelope(BaseModel):
    data: SeriesOverviewResponse


class AssetCollectionResponse(BaseModel):
    id: int
    venture_id: int
    kind: str
    name: str


class VentureAssetResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    version_id: int | None = None
    folder: str | None = None
    collection: str | None = None
    text: str | None = None
    title: str | None = None
    voice: str | None = None
    duration_ms: int | None = None
    filename: str | None = None
    missing: bool | None = None


class VentureAssetLibraryResponse(BaseModel):
    venture: HierarchyNodeResponse
    collections: list[AssetCollectionResponse]
    assets: list[VentureAssetResponse]


class VentureAssetLibraryEnvelope(BaseModel):
    data: VentureAssetLibraryResponse


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


class ProductionPartResponse(BaseModel):
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
    asset_of: int | None = None
    asset_id: int | None = None
    asset_version_id: int | None = None
    asset_kind: str | None = None
    asset_collection: str | None = None
    speech_mode: str | None = None
    cost_basis: str | None = None
    subtitled: bool = False
    subtitles_stale: bool = False
    caption_source_language: str | None = None
    languages: list[str] = Field(default_factory=list)
    missing: bool | None = None


class ProductionExportResponse(BaseModel):
    id: int
    production_id: int
    filename: str
    manifest: dict[str, Any]
    renderer: str
    duration_ms: int | None
    size_bytes: int
    created_at: str


class ProductionAccountingResponse(BaseModel):
    historical_spend: float
    current_sequence_cost: float
    retained_generation_cost: float
    tracked_spend: float
    untracked_legacy_spend: float


class ProductionRenderJobResponse(BaseModel):
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


class ProductionEditorResponse(WorkResourceResponse):
    type: Literal["production"]
    project_id: int
    series_id: int | None
    settings: dict[str, Any]
    trail: list[TrailItemResponse]
    parts: list[ProductionPartResponse]
    exports: list[ProductionExportResponse]
    export_job: ProductionRenderJobResponse | None = None
    total_cost: float
    current_sequence_cost: float
    accounting: ProductionAccountingResponse
    total_bytes: int


class ProductionEditorEnvelope(BaseModel):
    data: ProductionEditorResponse


class ArchivedResourceResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    type: Literal["venture", "project", "series", "production"]
    archived: bool | None = None
    deleted: bool | None = None


class ArchivedResourceEnvelope(BaseModel):
    data: ArchivedResourceResponse
