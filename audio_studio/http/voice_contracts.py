"""Public response contracts for voice identities and capabilities."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


Engine = str
Tier = str


class VoicePackageRouteResponse(BaseModel):
    provider_model_id: str
    provider: str
    region: str
    adapter_key: str
    engine: Engine
    tier: Tier
    model_id: str
    label: str
    role: str
    language: str
    source_language_documented: bool
    documented_output_languages: list[str]
    estimated_creation_cost: float
    capability_ids: list[str] = Field(default_factory=list)
    clone_source_duration_ms: dict[str, int] = Field(default_factory=dict)


class VoicePackageOptionResponse(BaseModel):
    id: Literal["complete", "exact"]
    name: str
    description: str
    models: list[str]
    available: bool


class VoicePackagePlanResponse(BaseModel):
    region: str
    region_label: str
    language: str
    package: Literal["complete", "exact"]
    routes: list[VoicePackageRouteResponse]
    available_routes: list[VoicePackageRouteResponse]
    packages: list[VoicePackageOptionResponse]
    total_estimated_creation_cost: float


class VoiceProfileMetadataResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    language: str | None = None
    recording_language: str | None = None
    editorial_language: str | None = None
    package: str | None = None
    image: str | None = None
    gender: str | None = None
    age: int | None = None
    accent: str | None = None
    trait: str | None = None
    scene: str | None = None
    notes: str | None = None
    favourite: bool | None = None
    status: Literal["active", "archived"] | None = None


class VoiceReferenceWindowResponse(BaseModel):
    id: str
    reference_id: str
    provider_model_id: str | None = None
    start_ms: int
    duration_ms: int
    source_language: str = ""
    transcript: str = ""
    enable_preprocess: bool | None = None
    derived_path: str = ""
    created_at: str
    updated_at: str


class VoiceReferenceWindowEnvelope(BaseModel):
    data: VoiceReferenceWindowResponse


class VoiceReferenceSummaryResponse(BaseModel):
    id: str
    original_name: str
    normalized_path: str
    source_language: str = ""
    transcript: str = ""
    sha256: str = ""
    duration_ms: int | None = None
    sample_rate: int | None = None
    channels: int | None = None
    metadata: dict = Field(default_factory=dict)
    diagnostics: dict = Field(default_factory=dict)
    windows: list[VoiceReferenceWindowResponse] = Field(default_factory=list)
    created_at: str
    updated_at: str


class VoiceProfileBindingResponse(BaseModel):
    binding_id: str
    provider_voice_id: str
    provider: str
    region: str
    provider_model_id: str | None = None
    model_id: str
    engine: Engine
    tier: Tier
    status: str
    languages: list[str]
    reference_id: str | None = None
    reference_window_id: str | None = None
    validation_state: Literal[
        "approved", "candidate", "rejected", "superseded"
    ] = "approved"
    superseded_by: str | None = None
    created_at: str


class VoicePackageJobResponse(BaseModel):
    id: str
    identity_id: str
    reference_id: str
    model_id: str
    provider: str
    region: str
    provider_model_id: str | None = None
    adapter_key: str
    classification: str
    binding_id: str | None = None
    reference_window_id: str | None = None
    engine: Engine
    tier: Tier
    status: str
    provider_voice_id: str | None = None
    error: str | None = None
    attempts: int
    updated_at: str


class VoiceProfileUsageResponse(BaseModel):
    uses: int
    productions: int
    spend: float
    last_used: str | None = None
    preview_filename: str = ""


class VoicePreviewResponse(BaseModel):
    id: str
    identity_id: str
    binding_id: str
    job_id: int | None = None
    tag: str | None = None
    text: str
    instruction: str = ""
    seed: int
    status: Literal["queued", "running", "ready", "failed"]
    approval_state: Literal["unreviewed", "approved", "rejected"]
    filename: str = ""
    duration_ms: int | None = None
    error: str = ""
    created_at: str
    model_id: str


class VoiceProfileResponse(BaseModel):
    id: str
    name: str
    metadata: VoiceProfileMetadataResponse
    preferred_reference_id: str | None = None
    references: list[VoiceReferenceSummaryResponse]
    bindings: list[VoiceProfileBindingResponse]
    jobs: list[VoicePackageJobResponse]
    previews: list[VoicePreviewResponse] = Field(default_factory=list)
    used_tags: list[str] = Field(default_factory=list)
    available_routes: list[VoicePackageRouteResponse]
    usage: VoiceProfileUsageResponse
    created_at: str
    updated_at: str


class CollectionMetaResponse(BaseModel):
    count: int
    total: int
    next_cursor: str | None


class VoiceProfileEnvelope(BaseModel):
    data: VoiceProfileResponse


class VoiceProfileCollectionEnvelope(BaseModel):
    data: list[VoiceProfileResponse]
    meta: CollectionMetaResponse


class HistoricalVoiceResponse(BaseModel):
    provider_voice_id: str
    engine: str
    model: str
    uses: int
    productions: int
    last_used: str | None = None
    preview_filename: str = ""


class HistoricalVoiceCollectionEnvelope(BaseModel):
    data: list[HistoricalVoiceResponse]
    meta: CollectionMetaResponse


class VoiceHistoryLinkResponse(BaseModel):
    linked: int
    profile: VoiceProfileResponse


class VoiceHistoryLinkEnvelope(BaseModel):
    data: VoiceHistoryLinkResponse


class VoicePackagePlanEnvelope(BaseModel):
    data: VoicePackagePlanResponse


class VoicePackageConfirmationResponse(BaseModel):
    needs_confirmation: Literal[True]
    estimate: float
    warn_above: float


class VoicePackageCreatedResponse(BaseModel):
    identity: VoiceProfileResponse
    queued: int
    plan: VoicePackagePlanResponse


class VoicePackageCreateEnvelope(BaseModel):
    data: VoicePackageCreatedResponse | VoicePackageConfirmationResponse


class VoicePackageRetryResponse(BaseModel):
    ok: Literal[True]
    job_id: str


class VoicePackageRetryEnvelope(BaseModel):
    data: VoicePackageRetryResponse


class VoicePreviewCreatedResponse(BaseModel):
    preview_id: str
    job_id: str


class VoicePreviewCreatedEnvelope(BaseModel):
    data: VoicePreviewCreatedResponse
