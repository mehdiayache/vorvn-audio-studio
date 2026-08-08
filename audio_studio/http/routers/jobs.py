"""Durable Job reads, events, and cancellation."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Header
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator
from uuid import uuid4

from audio_studio.domain.jobs import Job
from audio_studio.application.text_preparation import MODEL as TEXT_PREPARATION_MODEL
from audio_studio.http.errors import ApiProblem
from audio_studio.infrastructure.postgres.jobs import JobRepository


router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])
repository = JobRepository()


class SpeechJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1)
    text_raw: str | None = None
    text_shaped: str | None = None
    text_tagged: str | None = None
    text_state: str = "raw"
    project_id: int | None = None
    insert_at: int | None = None
    voice: str = Field(min_length=1)
    voice_identity_id: str | None = None
    engine: str
    model: str
    format: str = "mp3"
    language: str = "Auto"
    instruction: str = ""
    speech_mode: str = "exact"
    rate: float = 1
    pitch: float = 1
    volume: int = 50
    seed: int = 0
    confirmed: bool = False
    operation: Literal["create", "regenerate", "render_draft"] = "create"
    part_id: int | None = None

    @model_validator(mode="after")
    def part_is_present_for_replacement(self):
        if self.operation != "create" and not self.part_id:
            raise ValueError("A Part is required for that speech operation.")
        return self


class BatchJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=1, max_length=120)
    columns: dict[str, int | None]
    voice: str = Field(min_length=1)
    voice_identity_id: str | None = None
    engine: str
    model: str
    format: str = "mp3"
    language: str = ""
    instruction: str = ""
    rate: float = 1
    pitch: float = 1
    volume: int = 50
    confirmed: bool = False


class TranscriptionJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = ""
    name: str = ""
    file: str = ""
    generation_id: int | None = None
    playable: str = ""
    size_bytes: int = Field(default=0, ge=0, le=500_000_000)
    duration_ms: int = Field(default=0, ge=0)
    language: str = ""
    enable_itn: bool = False
    vocabulary_id: str | None = None
    confirmed: bool = False

    @model_validator(mode="after")
    def source_is_present(self):
        if not self.url.strip() and not self.file.strip():
            raise ValueError("Provide either an uploaded URL or an Audio Studio file.")
        return self


class TranslationJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int = Field(gt=0)
    target: str = Field(min_length=1, max_length=80)
    source: str = ""
    quality: str = "fast"
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
    engine: Literal["audio", "omni"] = "audio"
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


@router.post("/speech", operation_id="createSpeechJob", status_code=202)
def create_speech_job(payload: SpeechJobCreate,
                      idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> dict:
    values = payload.model_dump(exclude_none=True)
    job, created = repository.enqueue(
        "speech", values,
        idempotency_key=(idempotency_key or f"speech-{uuid4()}")[:200],
        production_id=payload.project_id,
        source_tool="production" if payload.project_id else "speak",
        operation_label={"create": "Generate speech", "regenerate": "Create another take", "render_draft": "Render draft"}[payload.operation],
    )
    return {"data": _payload(job), "meta": {"created": created}}


@router.post("/batch", operation_id="createBatchJob", status_code=202)
def create_batch_job(payload: BatchJobCreate,
                     idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> dict:
    job, created = repository.enqueue(
        "batch", payload.model_dump(exclude_none=True),
        idempotency_key=(idempotency_key or f"batch-{uuid4()}")[:200],
        source_tool="batch", operation_label="Generate batch",
    )
    return {"data": _payload(job), "meta": {"created": created}}


@router.post("/render", operation_id="createRenderJob", status_code=202)
def create_render_job(payload: RenderJobCreate,
                      idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> dict:
    job, created = repository.enqueue(
        "render", payload.model_dump(),
        idempotency_key=(idempotency_key or f"render-{uuid4()}")[:200],
        production_id=payload.production_id,
        source_tool="production", operation_label="Preview production" if payload.operation == "preview" else "Export production",
    )
    return {"data": _payload(job), "meta": {"created": created}}


@router.post("/transcription", operation_id="createTranscriptionJob", status_code=202)
def create_transcription_job(payload: TranscriptionJobCreate,
                             idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> dict:
    job, created = repository.enqueue(
        "transcribe", payload.model_dump(exclude_none=True),
        idempotency_key=(idempotency_key or f"transcribe-{uuid4()}")[:200],
        source_tool="subtitles", operation_label="Create subtitles",
    )
    return {"data": _payload(job), "meta": {"created": created}}


@router.post("/translation", operation_id="createTranslationJob", status_code=202)
def create_translation_job(payload: TranslationJobCreate,
                           idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> dict:
    job, created = repository.enqueue(
        "translate", payload.model_dump(exclude_none=True),
        idempotency_key=(idempotency_key or f"translate-{uuid4()}")[:200],
        source_tool="subtitles", operation_label="Translate subtitles",
    )
    return {"data": _payload(job), "meta": {"created": created}}


@router.post("/text", operation_id="createTextJob", status_code=202)
def create_text_job(payload: TextJobCreate,
                    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> dict:
    values = {**payload.model_dump(exclude_none=True),
              "model": TEXT_PREPARATION_MODEL}
    job, created = repository.enqueue(
        "rewrite", values,
        idempotency_key=(idempotency_key or f"rewrite-{uuid4()}")[:200],
        production_id=payload.production_id,
        source_tool="production" if payload.production_id else "speak",
        operation_label="Prepare spoken text" if payload.operation == "shape" else "Add delivery tags",
    )
    return {"data": _payload(job), "meta": {"created": created}}


@router.get("/{job_id}", operation_id="getJob")
def get_job(job_id: UUID) -> dict:
    job = repository.get(job_id)
    if not job:
        raise ApiProblem(404, "job_not_found", "That Job does not exist.")
    return {"data": _payload(job)}


@router.get("/{job_id}/events", operation_id="listJobEvents")
def get_job_events(job_id: UUID) -> dict:
    if not repository.get(job_id):
        raise ApiProblem(404, "job_not_found", "That Job does not exist.")
    events = repository.events(job_id)
    return {"data": events, "meta": {"count": len(events)}}


@router.post("/{job_id}/cancel", operation_id="cancelJob")
def cancel_job(job_id: UUID) -> dict:
    job = repository.cancel(job_id)
    if not job:
        raise ApiProblem(404, "job_not_found", "That Job does not exist.")
    return {"data": _payload(job)}
