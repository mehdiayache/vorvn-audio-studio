"""Durable Job reads, events, and cancellation."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Header
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator
from uuid import uuid4

from audio_studio.domain.jobs import Job
from audio_studio.application.text_preparation import MODEL as TEXT_PREPARATION_MODEL
from audio_studio.application.translation import MODELS as TRANSLATION_MODELS
from audio_studio.domain.transcription import FUN_MODEL, QWEN_MODEL
from audio_studio.composition.jobs import job_service
from audio_studio.composition.catalog import catalog_service
from audio_studio.http.errors import ApiProblem


router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


class JobResponse(BaseModel):
    id: str
    type: str
    status: str
    progress: float
    detail: str
    error: str | None = None
    retries: int
    created_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result: dict[str, Any]


class JobMeta(BaseModel):
    created: bool


class JobEnvelope(BaseModel):
    data: JobResponse


class JobCreatedEnvelope(JobEnvelope):
    meta: JobMeta


class JobEventResponse(BaseModel):
    id: int
    created_at: datetime
    kind: str
    progress: float | None = None
    detail: dict[str, Any]


class JobEventsMeta(BaseModel):
    count: int


class JobEventsEnvelope(BaseModel):
    data: list[JobEventResponse]
    meta: JobEventsMeta


class SpeechJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=500_000)
    text_raw: str | None = Field(default=None, max_length=500_000)
    text_shaped: str | None = Field(default=None, max_length=500_000)
    text_tagged: str | None = Field(default=None, max_length=500_000)
    text_state: Literal["raw", "shaped", "tagged"] = "raw"
    production_id: int | None = Field(
        default=None, gt=0,
        validation_alias=AliasChoices("production_id", "project_id"),
    )
    insert_at: int | None = Field(default=None, ge=0)
    voice: str = Field(min_length=1, max_length=300)
    voice_identity_id: str | None = Field(default=None, max_length=120)
    engine: Literal["audio", "omni", "qwen_tts"]
    model: Literal["plus", "flash", "vc"]
    format: Literal["mp3", "mp3-24k", "wav", "opus"] = "mp3"
    language: str = Field(default="Auto", max_length=80)
    instruction: str = Field(default="", max_length=100)
    speech_mode: Literal["exact", "directed"] = "exact"
    rate: float = Field(default=1, ge=.5, le=2)
    pitch: float = Field(default=1, ge=.5, le=2)
    volume: int = Field(default=50, ge=0, le=100)
    seed: int = Field(default=0, ge=0, le=2_147_483_647)
    confirmed: bool = False
    operation: Literal["create", "regenerate", "render_draft"] = "create"
    part_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def part_is_present_for_replacement(self):
        valid_models = {
            "audio": {"plus", "flash"},
            "omni": {"plus", "flash"},
            "qwen_tts": {"vc"},
        }
        if self.model not in valid_models[self.engine]:
            raise ValueError(
                f"{self.model} is not a valid quality for {self.engine}.")
        if self.operation != "create" and (not self.part_id or not self.production_id):
            raise ValueError(
                "A Production and Part are required for that speech operation.")
        if self.operation == "create" and self.part_id:
            raise ValueError("A new speech Part cannot replace an existing Part.")
        if self.production_id is None and self.insert_at is not None:
            raise ValueError("A sequence position requires a Production.")
        return self


class BatchColumns(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: int = Field(ge=0)
    name: int | None = Field(default=None, ge=0)
    voice: int | None = Field(default=None, ge=0)
    language: int | None = Field(default=None, ge=0)


class BatchJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(pattern=r"^[A-Za-z0-9-]{1,120}$")
    columns: BatchColumns
    voice: str = Field(min_length=1, max_length=300)
    voice_identity_id: str | None = Field(default=None, max_length=120)
    engine: Literal["audio", "omni", "qwen_tts"]
    model: Literal["plus", "flash", "vc"]
    format: Literal["mp3", "mp3-24k", "wav", "opus"] = "mp3"
    language: str = Field(default="", max_length=80)
    instruction: str = Field(default="", max_length=100)
    rate: float = Field(default=1, ge=.5, le=2)
    pitch: float = Field(default=1, ge=.5, le=2)
    volume: int = Field(default=50, ge=0, le=100)
    confirmed: bool = False


class TranscriptionJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(default="", max_length=4096)
    name: str = Field(default="", max_length=500)
    file: str = Field(default="", max_length=500)
    generation_id: int | None = Field(default=None, gt=0)
    production_id: int | None = Field(default=None, gt=0)
    playable: str = Field(default="", max_length=1000)
    size_bytes: int = Field(default=0, ge=0, le=500_000_000)
    duration_ms: int = Field(default=0, ge=0)
    language: str = Field(default="", max_length=80)
    enable_itn: bool = False
    vocabulary_id: str | None = Field(default=None, max_length=500)
    confirmed: bool = False

    @model_validator(mode="after")
    def source_is_present(self):
        has_url, has_file = bool(self.url.strip()), bool(self.file.strip())
        if not has_url and not has_file:
            raise ValueError("Provide either an uploaded URL or an Audio Studio file.")
        if has_url and (has_file or self.generation_id or self.production_id):
            raise ValueError(
                "Uploaded audio and Production Parts are separate sources.")
        if has_file and not self.generation_id:
            raise ValueError("Audio Studio files require their Part ID.")
        if self.production_id and not has_file:
            raise ValueError("A Production ID requires one of its Parts.")
        return self


class TranslationJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    transcript_id: int = Field(
        gt=0, validation_alias=AliasChoices("transcript_id", "id"))
    target: str = Field(min_length=1, max_length=80)
    source: str = Field(default="", max_length=80)
    quality: Literal["fast", "best"] = "fast"
    confirmed: bool = False


class TextJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    operation: Literal["shape", "tag"]
    text: str = Field(min_length=1)
    production_id: int | None = Field(
        default=None, gt=0,
        validation_alias=AliasChoices("production_id", "project_id"),
    )
    part_id: int | None = Field(
        default=None, gt=0,
        validation_alias=AliasChoices("part_id", "id"),
    )
    density: Literal["none", "light", "normal", "heavy"] = "normal"
    engine: Literal["audio", "omni", "qwen_tts"] = "audio"
    confirmed: bool = False


class RenderJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    production_id: int = Field(gt=0)
    operation: Literal["preview", "export"]


def _payload(job: Job) -> dict:
    return {"id": str(job.public_id), "type": job.kind, "status": job.status,
            "progress": job.progress, "detail": job.detail,
            "error": job.error or None, "retries": job.retries,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
            "result": job.result}


@router.post("/speech", operation_id="createSpeechJob", status_code=202,
             response_model=JobCreatedEnvelope)
def create_speech_job(payload: SpeechJobCreate,
                      idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> dict:
    # Keep explicit nulls: selecting a system voice intentionally clears a
    # previous cloned-voice identity on a replacement Take.
    values = payload.model_dump(exclude_unset=True)
    try:
        catalog_service.resolve_voice(values)
    except ValueError as exc:
        raise ApiProblem(409, "voice_route_unavailable", str(exc), {
            "voice_identity_id": payload.voice_identity_id,
            "engine": payload.engine,
            "model": payload.model,
            "language": payload.language,
        }) from exc
    job, created = job_service.enqueue(
        "speech", values,
        idempotency_key=(idempotency_key or f"speech-{uuid4()}")[:200],
        production_id=payload.production_id,
        source_tool="production" if payload.production_id else "speak",
        operation_label={"create": "Generate speech", "regenerate": "Create another take", "render_draft": "Render draft"}[payload.operation],
    )
    return {"data": _payload(job), "meta": {"created": created}}


@router.post("/batch", operation_id="createBatchJob", status_code=202,
             response_model=JobCreatedEnvelope)
def create_batch_job(payload: BatchJobCreate,
                     idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> dict:
    job, created = job_service.enqueue(
        "batch", payload.model_dump(exclude_none=True),
        idempotency_key=(idempotency_key or f"batch-{uuid4()}")[:200],
        source_tool="batch", operation_label="Generate batch",
    )
    return {"data": _payload(job), "meta": {"created": created}}


@router.post("/render", operation_id="createRenderJob", status_code=202,
             response_model=JobCreatedEnvelope)
def create_render_job(payload: RenderJobCreate,
                      idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> dict:
    job, created = job_service.enqueue(
        "render", payload.model_dump(),
        idempotency_key=(idempotency_key or f"render-{uuid4()}")[:200],
        production_id=payload.production_id,
        source_tool="production", operation_label="Preview production" if payload.operation == "preview" else "Export production",
    )
    return {"data": _payload(job), "meta": {"created": created}}


@router.post("/transcription", operation_id="createTranscriptionJob", status_code=202,
             response_model=JobCreatedEnvelope)
def create_transcription_job(payload: TranscriptionJobCreate,
                             idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> dict:
    values = {**payload.model_dump(exclude_none=True),
              "model": FUN_MODEL if payload.vocabulary_id else QWEN_MODEL}
    job, created = job_service.enqueue(
        "transcribe", values,
        idempotency_key=(idempotency_key or f"transcribe-{uuid4()}")[:200],
        production_id=payload.production_id,
        source_tool="production" if payload.production_id else "subtitles",
        operation_label="Create subtitles",
    )
    return {"data": _payload(job), "meta": {"created": created}}


@router.post("/translation", operation_id="createTranslationJob", status_code=202,
             response_model=JobCreatedEnvelope)
def create_translation_job(payload: TranslationJobCreate,
                           idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> dict:
    values = {**payload.model_dump(exclude_none=True),
              "model": TRANSLATION_MODELS[payload.quality]}
    job, created = job_service.enqueue(
        "translate", values,
        idempotency_key=(idempotency_key or f"translate-{uuid4()}")[:200],
        source_tool="subtitles", operation_label="Translate subtitles",
    )
    return {"data": _payload(job), "meta": {"created": created}}


@router.post("/text", operation_id="createTextJob", status_code=202,
             response_model=JobCreatedEnvelope)
def create_text_job(payload: TextJobCreate,
                    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> dict:
    values = {**payload.model_dump(exclude_none=True),
              "model": TEXT_PREPARATION_MODEL}
    job, created = job_service.enqueue(
        "rewrite", values,
        idempotency_key=(idempotency_key or f"rewrite-{uuid4()}")[:200],
        production_id=payload.production_id,
        source_tool="production" if payload.production_id else "speak",
        operation_label="Prepare spoken text" if payload.operation == "shape" else "Add delivery tags",
    )
    return {"data": _payload(job), "meta": {"created": created}}


@router.get("/{job_id}", operation_id="getJob", response_model=JobEnvelope)
def get_job(job_id: UUID) -> dict:
    job = job_service.get(job_id)
    if not job:
        raise ApiProblem(404, "job_not_found", "That Job does not exist.")
    return {"data": _payload(job)}


@router.get(
    "/{job_id}/events", operation_id="listJobEvents",
    response_model=JobEventsEnvelope,
)
def get_job_events(job_id: UUID) -> dict:
    if not job_service.get(job_id):
        raise ApiProblem(404, "job_not_found", "That Job does not exist.")
    events = job_service.events(job_id)
    return {"data": events, "meta": {"count": len(events)}}


@router.post(
    "/{job_id}/cancel", operation_id="cancelJob",
    response_model=JobEnvelope,
)
def cancel_job(job_id: UUID) -> dict:
    job = job_service.cancel(job_id)
    if not job:
        raise ApiProblem(404, "job_not_found", "That Job does not exist.")
    return {"data": _payload(job)}
