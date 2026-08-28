"""Public response contracts for bounded uploads."""

from datetime import datetime

from pydantic import BaseModel

from audio_studio.domain.media import AssetMediaType
from audio_studio.domain.uploads import AssetCategory, AssetScope


class UploadedImageResponse(BaseModel):
    url: str


class UploadedImageEnvelope(BaseModel):
    data: UploadedImageResponse


class UploadedVoiceReferenceResponse(BaseModel):
    name: str
    reference_id: str
    duration_ms: int
    sample_rate: int
    channels: int


class UploadedVoiceReferenceEnvelope(BaseModel):
    data: UploadedVoiceReferenceResponse


class UploadedAssetResponse(BaseModel):
    id: int
    version_id: int
    name: str
    filename: str
    media_type: AssetMediaType
    duration_ms: int | None = None
    url: str
    category: AssetCategory
    scope: AssetScope
    tags: list[str]
    metadata: dict
    media_format: str
    audio_format: str | None = None
    sample_rate: int | None = None
    channels: int | None = None
    width: int | None = None
    height: int | None = None
    video_codec: str | None = None
    frame_rate: float | None = None
    size_bytes: int
    mime_type: str
    version_metadata: dict
    created_at: datetime
    updated_at: datetime


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
