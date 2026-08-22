"""Public response contracts for bounded uploads."""

from pydantic import BaseModel


class UploadedImageResponse(BaseModel):
    url: str


class UploadedImageEnvelope(BaseModel):
    data: UploadedImageResponse


class UploadedVoiceReferenceResponse(BaseModel):
    name: str
    reference_id: str


class UploadedVoiceReferenceEnvelope(BaseModel):
    data: UploadedVoiceReferenceResponse


class UploadedAssetResponse(BaseModel):
    id: int
    version_id: int
    name: str
    filename: str
    duration_ms: int
    url: str
    category: str
    scope: str
    tags: list[str]
    metadata: dict
    audio_format: str
    sample_rate: int | None = None
    channels: int | None = None
    size_bytes: int
    mime_type: str
    version_metadata: dict


class UploadedAssetEnvelope(BaseModel):
    data: UploadedAssetResponse


class UploadedTranscriptionSourceResponse(BaseModel):
    url: str
    name: str
    playable: str
    size_bytes: int
    duration_ms: int


class UploadedTranscriptionSourceEnvelope(BaseModel):
    data: UploadedTranscriptionSourceResponse
