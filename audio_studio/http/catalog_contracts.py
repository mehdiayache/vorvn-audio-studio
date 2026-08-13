"""Public response contracts for Studio and voice catalogues."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class PerformancePresetResponse(BaseModel):
    id: str
    name: str
    instruction: str
    capability_ids: list[str]


class VoiceCapabilityResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str = ""
    controls: dict[str, Any] = Field(default_factory=dict)
    ui_metadata: dict[str, Any] = Field(default_factory=dict)


class WorkspaceResponse(BaseModel):
    configured: bool
    id: str = ""
    region: str
    region_label: str
    http_base: str


class StudioConfigResponse(BaseModel):
    voices: dict[str, dict[str, str]]
    default_voice: dict[str, str]
    chosen_default_voice: str
    models: dict[str, str]
    formats: list[str]
    tags: dict[str, dict[str, str]]
    retired_tags: dict[str, str]
    tag_variables: dict[str, str]
    naming: dict[str, Any]
    voice_images: dict[str, str]
    voice_favourites: list[str]
    naming_tokens: list[str]
    languages: list[str]
    capabilities: dict[str, dict[str, Any]]
    performance_presets: list[PerformancePresetResponse]
    clone_languages: dict[str, str]
    workspace: WorkspaceResponse
    instruction_max: int
    text_preparation: dict[str, Any]
    rates: dict[str, float]
    synth_flags: dict[str, Any]
    segmentation: dict[str, dict[str, Any]]
    has_key: bool
    out_dir: str
    prefs: dict[str, Any]
    spend: dict[str, Any]
    database: dict[str, Any]
    storage: dict[str, Any]
    storage_settings: dict[str, Any]


class StudioConfigEnvelope(BaseModel):
    data: StudioConfigResponse


class VoiceReferenceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str | None = None
    identity_id: str | None = None
    original_name: str | None = None
    original_path: str | None = None
    normalized_path: str | None = None
    source_language: str | None = None


class VoiceBindingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity_id: str
    binding_id: str | None = None
    catalogue_voice_id: str | None = None
    provider_voice_id: str
    name: str
    description: str
    languages: list[str]
    source: Literal["system", "custom"]
    provider: str
    region: str = "intl"
    adapter_key: str
    engine: Literal["audio", "omni", "qwen_tts"]
    tier: Literal["plus", "flash", "vc"]
    model_id: str
    status: str
    estimate_rate_per_million_chars: float = 0
    reference_id: str | None = None
    image: str | None = None
    gender: str | None = None
    age: int | None = None
    accent: str | None = None
    scene: str | None = None
    reference: VoiceReferenceResponse | None = None
    capabilities: list[VoiceCapabilityResponse] = Field(default_factory=list)


class VoiceModelSummaryResponse(BaseModel):
    engine: Literal["audio", "omni", "qwen_tts"]
    tier: Literal["plus", "flash", "vc"]
    model_id: str
    label: str
    system_count: int
    custom_count: int
    total_count: int
    clone_supported: bool


class VoiceRegistrySourceResponse(BaseModel):
    provider: str
    verified_at: str
    audio_url: str
    omni_url: str


class VoiceRegistryResponse(BaseModel):
    models: list[VoiceModelSummaryResponse]
    bindings: list[VoiceBindingResponse]
    presets: list[PerformancePresetResponse]
    source: VoiceRegistrySourceResponse


class VoiceRegistryEnvelope(BaseModel):
    data: VoiceRegistryResponse


class VoiceMetadataResponse(BaseModel):
    image: str | None = None
    favourite: bool | None = None
    note: str | None = None
    name: str | None = None
    gender: str | None = None
    age: int | None = None
    trait: str | None = None
    scene: str | None = None
    languages: str | None = None
    provider_voice_id: str | None = None
    engine: str | None = None
    target_model: str | None = None
    provider_status: str | None = None


class VoiceMetadataEnvelope(BaseModel):
    data: dict[str, VoiceMetadataResponse]


class VoiceUsageResponse(BaseModel):
    uses: int
    folders: int
    spend: float
    last_used: str | None = None
    latest_preview: str | None = None


class VoiceUsageEnvelope(BaseModel):
    data: dict[str, VoiceUsageResponse]


class VoiceRouteResponse(BaseModel):
    binding_id: str | None = None
    catalogue_voice_id: str | None = None
    identity_id: str | None
    reference_id: str | None = None
    provider_voice_id: str
    provider: str
    region: str
    engine: str
    tier: str
    model_id: str
    capability_id: str | None = None
    capability_name: str | None = None


class VoiceRouteEnvelope(BaseModel):
    data: VoiceRouteResponse
