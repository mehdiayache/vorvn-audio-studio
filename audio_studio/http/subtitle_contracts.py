"""Public HTTP response contracts for saved subtitles and free layouts."""

from typing import Literal

from pydantic import BaseModel, Field


CaptionProfileKey = Literal["standard", "short", "words"]


class SubtitleSummaryResponse(BaseModel):
    id: int
    public_id: str
    when: str
    name: str
    duration_ms: int
    lines: int
    model: str | None
    provider_region: str | None
    cost: float
    cost_basis: str | None
    timing_source: str | None = None
    source_job_id: str | None


class SubtitleListEnvelope(BaseModel):
    data: list[SubtitleSummaryResponse]


class CaptionWordResponse(BaseModel):
    start: int
    end: int
    text: str


class TranscriptSentenceResponse(BaseModel):
    start: int
    end: int | None = None
    text: str
    words: list[CaptionWordResponse] = Field(default_factory=list)


class SubtitleResponse(BaseModel):
    id: int
    public_id: str | None
    file: str
    url: str | None
    text: str
    srt: str
    vtt: str
    sentences: list[TranscriptSentenceResponse]
    duration_ms: int
    language: str | None
    created_at: str | None
    cost: float
    cost_basis: str
    timing_source: str | None = None
    model: str | None
    provider_region: str | None
    price_version: str | None
    catalog_rate: float
    source_job_id: str | None
    space_id: int | None


class SubtitleEnvelope(BaseModel):
    data: SubtitleResponse


class CaptionProfileResponse(BaseModel):
    key: CaptionProfileKey
    label: str
    description: str
    max_words: int
    max_chars: int
    line_chars: int
    max_lines: int
    min_duration_ms: int
    max_duration_ms: int


class CaptionCueResponse(BaseModel):
    start: int
    end: int
    text: str
    words: list[CaptionWordResponse]
    timing: Literal["word", "estimated"]


class CaptionMetricsResponse(BaseModel):
    cues: int
    average_words: float
    maximum_cps: float


class CaptionLayoutResponse(BaseModel):
    profile: CaptionProfileResponse
    cues: list[CaptionCueResponse]
    srt: str
    vtt: str
    timing_json: str
    timing_quality: Literal["word_aligned", "estimated"]
    metrics: CaptionMetricsResponse


class CaptionLayoutEnvelope(BaseModel):
    data: CaptionLayoutResponse


class SubtitleDeletedResponse(BaseModel):
    deleted: bool


class SubtitleDeletedEnvelope(BaseModel):
    data: SubtitleDeletedResponse
