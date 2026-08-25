"""Durable Job reads, events, and cancellation."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Header
from pydantic import BaseModel, ConfigDict, Field, model_validator
from uuid import uuid4

from audio_studio.domain.jobs import Job
from audio_studio.application.text_preparation import MODEL as TEXT_PREPARATION_MODEL
from audio_studio.application.translation import MODELS as TRANSLATION_MODELS
from audio_studio.domain.transcription import FUN_MODEL, QWEN_MODEL
from audio_studio.composition.jobs import job_service
from audio_studio.composition.production_speech import production_speech_service
from audio_studio.composition.catalog import catalog_service
from audio_studio.composition.audio_generation import audio_generation_service
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
    part_id: int | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class JobMeta(BaseModel):
    created: bool


class JobEnvelope(BaseModel):
    data: JobResponse


class JobCreatedEnvelope(JobEnvelope):
    meta: JobMeta


class SpeechGenerateResultResponse(BaseModel):
    """Documented speech result facts already produced by the runtime."""

    model_config = ConfigDict(extra="allow")

    part_id: int | None = None
    clip_id: int | None = None
    duration_ms: int | None = None


class SpeechJobResponse(JobResponse):
    result: SpeechGenerateResultResponse


class SpeechJobCreatedEnvelope(BaseModel):
    data: SpeechJobResponse
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
    spoken_profile: Literal["spoken_1", "spoken_2"] = "spoken_1"
    production_id: int | None = Field(default=None, gt=0)
    insert_before_part_id: UUID | None = None
    authored_role: str | None = Field(default=None, max_length=120)
    voice_identity_id: str | None = Field(default=None, max_length=120)
    binding_id: UUID | None = None
    catalogue_voice_id: str | None = Field(default=None, max_length=700)
    capability_id: str | None = Field(default=None, max_length=120)
    format: Literal["mp3", "mp3-24k", "wav", "opus"] = "mp3"
    language: str = Field(default="Auto", max_length=80)
    instruction: str = ""
    speech_mode: str = Field(default="exact", min_length=1, max_length=120)
    rate: float = Field(default=1, ge=.5, le=2)
    pitch: float = Field(default=1, ge=.5, le=2)
    volume: int = Field(default=50, ge=0, le=100)
    seed: int = Field(default=0, ge=0, le=2_147_483_647)
    enable_ssml: bool = False
    confirmed: bool = False
    part_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def target_is_coherent(self):
        if bool(self.binding_id) == bool(self.catalogue_voice_id):
            raise ValueError("Choose exactly one cloned binding or catalogue voice.")
        if self.part_id and not self.production_id:
            raise ValueError("A Part recording requires its Production.")
        if self.part_id and self.insert_before_part_id:
            raise ValueError("An existing Part cannot have an insertion point.")
        if self.insert_before_part_id and not self.production_id:
            raise ValueError("An insertion point requires a Production.")
        return self


class TranscriptionJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(default="", max_length=4096)
    name: str = Field(default="", max_length=500)
    file: str = Field(default="", max_length=500)
    part_id: int | None = Field(default=None, gt=0)
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
            raise ValueError("Provide either an uploaded URL or an Auvi Studio file.")
        if has_url and (has_file or self.part_id or self.production_id):
            raise ValueError(
                "Uploaded audio and Production Parts are separate sources.")
        if has_file and not self.part_id:
            raise ValueError("Auvi Studio files require their Part ID.")
        if self.production_id and not has_file:
            raise ValueError("A Production ID requires one of its Parts.")
        return self


class TranslationJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transcript_id: int = Field(gt=0)
    target: str = Field(min_length=1, max_length=80)
    source: str = Field(default="", max_length=80)
    quality: Literal["fast", "best"] = "fast"
    confirmed: bool = False


class TextJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["shape", "tag"]
    text: str = Field(min_length=1)
    production_id: int | None = Field(default=None, gt=0)
    part_id: int | None = Field(default=None, gt=0)
    density: Literal["none", "light", "normal", "heavy"] = "normal"
    spoken_profile: Literal["spoken_1", "spoken_2"] = "spoken_1"
    capability_id: str = Field(min_length=1, max_length=120)
    confirmed: bool = False


class RenderJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    production_id: int = Field(gt=0)
    operation: Literal["preview", "export"]
    allow_incomplete: bool = False


class AudioGenerationJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    capability: Literal["sfx", "music"]
    prompt: str | None = Field(default=None, min_length=1, max_length=500)
    prompt_mode: Literal["simple", "expert"] = "expert"
    generation_brief: dict[str, Any] | None = None
    semantic_state: dict[str, Any] | None = None
    source_free_text: str = Field(default="", max_length=2_000)
    final_prompt_override: str | None = Field(
        default=None, min_length=1, max_length=500)
    authored_prompt: str | None = Field(default=None, max_length=500)
    seconds: int = Field(ge=1, le=120)
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    production_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def duration_matches_capability(self):
        minimum, maximum = ((1, 30) if self.capability == "sfx"
                            else (5, 120))
        if not minimum <= self.seconds <= maximum:
            raise ValueError(
                f"{self.capability.upper()} duration must be between "
                f"{minimum} and {maximum} seconds.")
        if self.generation_brief is not None:
            encoded = str(self.generation_brief)
            if len(encoded) > 5_000:
                raise ValueError("The generation brief is too large.")
        if self.semantic_state is None and self.prompt is None:
            raise ValueError("Provide a Sound Recipe or a generation prompt.")
        if self.semantic_state is not None and len(str(
                self.semantic_state)) > 30_000:
            raise ValueError("The Sound Recipe is too large.")
        return self


class SoundRecipeNormalizationJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    capability: Literal["sfx", "music"]
    semantic_state: dict[str, Any]
    source_free_text: str = Field(default="", max_length=2_000)
    production_id: int | None = Field(default=None, gt=0)
    confirmed: bool = False

    @model_validator(mode="after")
    def recipe_is_bounded(self):
        if len(str(self.semantic_state)) > 30_000:
            raise ValueError("The Sound Recipe is too large.")
        return self


def _payload(job: Job) -> dict:
    context_keys = {
        "part_id", "production_id", "transcript_id", "target", "language",
        "operation", "confirmed", "allow_incomplete", "capability", "seconds",
    }
    return {"id": str(job.public_id), "type": job.kind, "status": job.status,
            "progress": job.progress, "detail": job.detail,
            "error": job.error or None, "retries": job.retries,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
            "result": job.result, "part_id": job.part_id,
            "context": {key: value for key, value in job.payload.items()
                        if key in context_keys}}


@router.post("/speech", operation_id="createSpeechJob", status_code=202,
             response_model=SpeechJobCreatedEnvelope)
def create_speech_job(payload: SpeechJobCreate,
                      idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> dict:
    # Keep explicit nulls: selecting a system voice intentionally clears a
    # previous cloned-voice identity on a replacement recording.
    # JSON mode keeps UUID session identities safe for the durable JSONB payload.
    values = payload.model_dump(exclude_unset=True, mode="json")
    try:
        resolved = catalog_service.resolve_voice(values)
    except ValueError as exc:
        raise ApiProblem(409, "voice_route_unavailable", str(exc), {
            "binding_id": str(payload.binding_id) if payload.binding_id else None,
            "catalogue_voice_id": payload.catalogue_voice_id,
        }) from exc
    values.update({
        "voice": resolved["provider_voice_id"],
        "voice_identity_id": resolved.get("identity_id"),
        "engine": resolved["engine"], "model": resolved["tier"],
        "capability_id": resolved.get("capability_id"),
    })
    key = (idempotency_key or f"speech-{uuid4()}")[:200]
    if payload.production_id is not None:
        before_part = payload.insert_before_part_id
        job, created = production_speech_service.enqueue(
            values, idempotency_key=key,
            production_id=payload.production_id,
            before_part_public_id=before_part,
            operation_label=("Generate Part" if payload.part_id
                             else "Generate and add Part"))
    else:
        job, created = job_service.enqueue(
            "speech", values, idempotency_key=key,
            source_tool="speak", operation_label="Create recording")
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


@router.post("/audio-generation", operation_id="createAudioGenerationJob",
             status_code=202, response_model=JobCreatedEnvelope)
def create_audio_generation_job(
    payload: AudioGenerationJobCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    try:
        job, created = audio_generation_service.enqueue(
            **payload.model_dump(),
            idempotency_key=(
                idempotency_key or f"audio-generation-{uuid4()}")[:200])
    except ValueError as exc:
        raise ApiProblem(400, "invalid_audio_generation", str(exc)) from exc
    return {"data": _payload(job), "meta": {"created": created}}


@router.post("/sound-recipe-normalization",
             operation_id="createSoundRecipeNormalizationJob",
             status_code=202, response_model=JobCreatedEnvelope)
def create_sound_recipe_normalization_job(
    payload: SoundRecipeNormalizationJobCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    job, created = job_service.enqueue(
        "sound_recipe_normalize", payload.model_dump(),
        idempotency_key=(
            idempotency_key or f"sound-recipe-normalization-{uuid4()}")[:200],
        production_id=payload.production_id,
        source_tool="production",
        operation_label="Understand Sound Recipe",
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
        part_id=payload.part_id,
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


@router.post(
    "/{job_id}/confirm", operation_id="confirmJobCost",
    status_code=202, response_model=JobCreatedEnvelope,
)
def confirm_job_cost(
    job_id: UUID,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    try:
        job, created = job_service.confirm(
            job_id,
            idempotency_key=(idempotency_key
                             or f"confirm-{job_id}-{uuid4()}")[:200],
        )
    except LookupError as exc:
        raise ApiProblem(404, "job_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(409, "job_not_confirmable", str(exc)) from exc
    return {"data": _payload(job), "meta": {"created": created}}
