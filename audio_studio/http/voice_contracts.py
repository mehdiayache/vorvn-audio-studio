"""Public response contracts for voice identities and capabilities."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


Engine = Literal["audio", "omni"]
Tier = Literal["plus", "flash"]


class VoicePackageRouteResponse(BaseModel):
    provider: str
    engine: Engine
    tier: Tier
    model_id: str
    label: str
    role: str
    language: str
    estimated_creation_cost: float


class VoicePackageOptionResponse(BaseModel):
    id: Literal["complete", "exact", "omni"]
    name: str
    description: str
    models: list[str]
    available: bool


class VoicePackagePlanResponse(BaseModel):
    region: Literal["intl", "beijing"]
    region_label: str
    language: str
    package: Literal["complete", "exact", "omni"]
    routes: list[VoicePackageRouteResponse]
    available_routes: list[VoicePackageRouteResponse]
    packages: list[VoicePackageOptionResponse]
    total_estimated_creation_cost: float


class VoiceProfileMetadataResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    language: str | None = None
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


class VoiceReferenceSummaryResponse(BaseModel):
    id: str
    original_name: str
    normalized_path: str
    created_at: str


class VoiceProfileBindingResponse(BaseModel):
    provider_voice_id: str
    model_id: str
    engine: Engine
    tier: Tier
    status: str
    languages: list[str]
    created_at: str


class VoicePackageJobResponse(BaseModel):
    id: str
    identity_id: str
    reference_id: str
    model_id: str
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


class VoiceProfileResponse(BaseModel):
    id: str
    name: str
    metadata: VoiceProfileMetadataResponse
    references: list[VoiceReferenceSummaryResponse]
    bindings: list[VoiceProfileBindingResponse]
    jobs: list[VoicePackageJobResponse]
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
