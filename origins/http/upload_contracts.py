"""Public response contracts for bounded uploads."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from origins.domain.files import FileFamily
from origins.domain.uploads import FileCategory


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


class UploadedFileResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    version_id: int
    name: str
    filename: str
    family: FileFamily = Field(validation_alias="media_type")
    duration_ms: int | None = None
    url: str
    category: FileCategory | None = None
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


class UploadedFileEnvelope(BaseModel):
    data: UploadedFileResponse


class UpdateFileBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    category: FileCategory | None = None
    tags: list[str] = Field(default_factory=list, max_length=12)


class UploadedTranscriptionSourceResponse(BaseModel):
    url: str
    name: str
    playable: str
    size_bytes: int
    duration_ms: int


class UploadedTranscriptionSourceEnvelope(BaseModel):
    data: UploadedTranscriptionSourceResponse
