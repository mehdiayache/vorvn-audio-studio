"""Public HTTP response contracts for Batch intake."""

from pydantic import BaseModel


class BatchColumnGuessResponse(BaseModel):
    text: int
    name: int | None = None
    voice: int | None = None
    language: int | None = None


class BatchUnknownVoiceResponse(BaseModel):
    voice: str
    first_row: int


class BatchVoiceCheckResponse(BaseModel):
    unknown: list[BatchUnknownVoiceResponse]
    checked: int


class BatchPreviewResponse(BaseModel):
    token: str
    name: str
    headers: list[str]
    rows: int
    preview: list[list[str]]
    guess: BatchColumnGuessResponse
    voices: BatchVoiceCheckResponse
    truncated: bool
    max_rows: int


class BatchPreviewEnvelope(BaseModel):
    data: BatchPreviewResponse


class BatchVoiceValidationRequest(BaseModel):
    token: str
    voice_column: int | None = None


class BatchVoiceValidationEnvelope(BaseModel):
    data: BatchVoiceCheckResponse
