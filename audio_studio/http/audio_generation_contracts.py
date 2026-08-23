"""Public contracts for temporary generated audio and explicit Keep."""

from typing import Any

from pydantic import BaseModel, ConfigDict

from audio_studio.http.upload_contracts import UploadedAssetResponse


class AudioGenerationStatusResponse(BaseModel):
    configured: bool
    sfx_ready: bool
    music_ready: bool
    reason: str | None = None
    models: dict[str, Any]


class AudioGenerationStatusEnvelope(BaseModel):
    data: AudioGenerationStatusResponse


class AudioGenerationCandidateResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    candidate_id: str
    candidate_url: str
    capability: str
    prompt: str
    prompt_mode: str = "expert"
    generation_brief: dict[str, Any] | None = None
    authored_prompt: str | None = None
    resolved_prompt: str | None = None
    seconds: int
    seed: int
    duration_ms: int
    audio_format: str
    sample_rate: int | None = None
    channels: int | None = None
    size_bytes: int


class AudioGenerationCandidateEnvelope(BaseModel):
    data: AudioGenerationCandidateResponse


class AudioGenerationRequestResponse(BaseModel):
    capability: str
    prompt_mode: str
    generation_brief: dict[str, Any] | None = None
    authored_prompt: str | None = None
    resolved_prompt: str
    seconds: int
    seed: int | None = None


class AudioGenerationHistoryItemResponse(BaseModel):
    job_id: str
    status: str
    progress: float
    detail: str
    error: str | None = None
    created_at: str | None = None
    request: AudioGenerationRequestResponse
    candidate: AudioGenerationCandidateResponse | None = None
    candidate_available: bool
    kept_asset: UploadedAssetResponse | None = None


class AudioGenerationHistoryEnvelope(BaseModel):
    data: list[AudioGenerationHistoryItemResponse]


class GeneratedKeepResponse(BaseModel):
    asset: UploadedAssetResponse
    duplicate: bool


class GeneratedKeepEnvelope(BaseModel):
    data: GeneratedKeepResponse


class GeneratedDiscardResponse(BaseModel):
    discarded: bool


class GeneratedDiscardEnvelope(BaseModel):
    data: GeneratedDiscardResponse
