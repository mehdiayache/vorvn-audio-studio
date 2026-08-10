"""Public response contracts for Production Timeline commands."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

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
