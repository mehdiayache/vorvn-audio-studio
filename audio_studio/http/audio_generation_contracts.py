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
    seconds: int
    seed: int
    duration_ms: int
    audio_format: str
    sample_rate: int | None = None
    channels: int | None = None
    size_bytes: int


class AudioGenerationCandidateEnvelope(BaseModel):
    data: AudioGenerationCandidateResponse


class GeneratedKeepResponse(BaseModel):
    asset: UploadedAssetResponse
    duplicate: bool


class GeneratedKeepEnvelope(BaseModel):
    data: GeneratedKeepResponse


class GeneratedDiscardResponse(BaseModel):
    discarded: bool


class GeneratedDiscardEnvelope(BaseModel):
    data: GeneratedDiscardResponse
