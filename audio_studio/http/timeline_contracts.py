"""Public response contracts for Production Timeline commands."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from audio_studio.http.work_contracts import FidelityResponse


class MusicBedResponse(BaseModel):
    music_of: int | None = None
    level: str | None = None
    fade_in: float | None = None
    fade_out: float | None = None
    duck: bool | None = None
    volume: float | None = None
    start: float | None = None
    filename: str | None = None
    name: str | None = None
    duration_ms: int | None = None


class MusicBedEnvelope(BaseModel):
    data: MusicBedResponse


class OkResponse(BaseModel):
    ok: bool
    subtitles_stale: int | None = None
    changed: bool | None = None
    revision: int | None = None
    outdated: bool | None = None
    needs_confirmation: bool | None = None


class OkEnvelope(BaseModel):
    data: OkResponse


class PartCreatedResponse(BaseModel):
    id: int
    seconds: float | None = None
    filename: str | None = None


class PartCreatedEnvelope(BaseModel):
    data: PartCreatedResponse


class DeletedPartsResponse(BaseModel):
    deleted: int


class DeletedPartsEnvelope(BaseModel):
    data: DeletedPartsResponse


class MovedPartsResponse(BaseModel):
    moved: int


class MovedPartsEnvelope(BaseModel):
    data: MovedPartsResponse


class TakeResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    when: str
    voice: str
    voice_name: str | None = None
    public_id: str
    voice_identity_id: str | None = None
    engine: str
    model: str
    rate: float
    pitch: float
    seed: int
    filename: str
    size_bytes: int
    cost: float
    text: str
    duration_ms: int | None = None
    instruction: str | None = None
    language: str | None = None
    fidelity: FidelityResponse | None = None
    source_part_revision: int
    source_script_hash: str
    outdated: bool
    binding_id: str | None = None
    catalogue_voice_id: str | None = None
    capability_id: str | None = None
    reference_id: str | None = None
    provider: str | None = None
    provider_region: str | None = None
    tier: str | None = None
    raw_text: str | None = None
    tagged_text: str | None = None
    text_state: str | None = None
    usage: dict = Field(default_factory=dict)
    segmentation: dict = Field(default_factory=dict)
    cost_basis: str | None = None
    binding_resolution_status: str | None = None
    provider_attempt_id: str | None = None
    provider_attempt_status: str | None = None


class TakeListEnvelope(BaseModel):
    data: list[TakeResponse]


class TranscriptSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    name: str
    language: str | None = None
    duration_ms: int | None = None
    is_translation: bool
    stale: bool


class TranscriptSummaryListEnvelope(BaseModel):
    data: list[TranscriptSummaryResponse]
