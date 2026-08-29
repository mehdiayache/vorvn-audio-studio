"""Capabilities and durable provider generations for Director."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Header
from pydantic import BaseModel, ConfigDict, Field

from audio_studio.composition.director_generation import director_generation_service
from audio_studio.http.errors import ApiProblem


router = APIRouter(prefix="/api/v1", tags=["director-generations"])


class DirectorInputSlot(BaseModel):
    role: str
    label: str
    required: bool
    media_types: list[Literal["image", "video", "audio"]]
    max: int
    mime_types: list[str] = Field(default_factory=list)
    max_bytes: int | None = None
    duration_min_ms: int | None = None
    duration_max_ms: int | None = None
    min_width: int | None = None
    min_height: int | None = None
    max_width: int | None = None
    max_height: int | None = None
    max_pixels: int | None = None
    fps_min: float | None = None
    fps_max: float | None = None
    aspect_ratio_min: float | None = None
    aspect_ratio_max: float | None = None


class DirectorPromptCapability(BaseModel):
    supported: bool
    required: bool
    negative_prompt: bool
    max_length: int = 20_000


class DirectorParameterCapability(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str
    type: Literal[
        "boolean", "integer", "number", "select", "text", "textarea",
        "asset_list", "structured_shots",
    ]
    label: str
    exposure: Literal["primary", "advanced"] = "advanced"
    required: bool = False
    default: Any = None
    options: list[Any] = Field(default_factory=list)
    min: float | None = None
    max: float | None = None
    step: float | None = None
    max_length: int | None = None
    visible_when: dict[str, Any] = Field(default_factory=dict)
    conflicts_with: list[str] = Field(default_factory=list)
    item: dict[str, Any] = Field(default_factory=dict)


class DirectorDurationRange(BaseModel):
    min: int
    max: int
    step: int
    default: int


class DirectorOutputCapability(BaseModel):
    mime_type: str
    extension: str


class DirectorControlRule(BaseModel):
    when: dict[str, Any] = Field(default_factory=dict)
    values: list[str]
    default: str


class DirectorOperationCapability(BaseModel):
    operation: str
    output_media_type: Literal["image", "video"]
    prompt: DirectorPromptCapability
    inputs: list[DirectorInputSlot]
    input_order: list[str] = Field(default_factory=list)
    input_modes: list[dict[str, Any]] = Field(default_factory=list)
    required_any_of: list[list[str]] = Field(default_factory=list)
    ratios: list[str]
    ratio_rules: list[DirectorControlRule] = Field(default_factory=list)
    resolutions: list[str]
    durations: list[int]
    duration_range: DirectorDurationRange | None = None
    fps: list[int]
    supports_seed: bool
    supports_cancel: bool
    parameters: list[DirectorParameterCapability] = Field(default_factory=list)
    output: DirectorOutputCapability


class DirectorModelCapability(BaseModel):
    id: str
    label: str
    provider: str
    provider_id: str
    provider_model_id: str
    adapter_key: str
    adapter_version: str
    capability_manifest_version: str
    status: Literal["draft", "verified", "enabled"]
    description: str
    operations: list[DirectorOperationCapability]


class DirectorOperationInfo(BaseModel):
    id: str
    label: str
    detail: str


class DirectorCapabilities(BaseModel):
    providers: list[dict[str, str]]
    operations: list[DirectorOperationInfo]
    models: list[DirectorModelCapability]


class DirectorCapabilitiesEnvelope(BaseModel):
    data: DirectorCapabilities


class DirectorGenerationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_id: int = Field(gt=0)
    role: str = Field(min_length=1, max_length=80)
    media_type: Literal["image", "video", "audio"]
    position: int = Field(ge=0)


class DirectorGenerationControls(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ratio: str = ""
    resolution: str = ""
    duration: int | None = Field(default=None, gt=0)
    fps: int | None = Field(default=None, gt=0)
    seed: int | None = Field(default=None, ge=0)
    provider_parameters: dict[str, Any] = Field(default_factory=dict)


class DirectorGenerationRecipe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: str = Field(min_length=1, max_length=80)
    model_id: str = Field(min_length=1, max_length=120)
    prompt: str = Field(default="", max_length=20_000)
    negative_prompt: str = Field(default="", max_length=20_000)
    inputs: list[DirectorGenerationInput] = Field(default_factory=list, max_length=100)
    controls: DirectorGenerationControls


class DirectorGenerationResponse(BaseModel):
    id: str
    job_id: str
    status: Literal["queued", "generating", "ready", "canceled", "failed"]
    progress: int
    detail: str
    error: str | None
    recipe: DirectorGenerationRecipe
    provider: str
    provider_id: str | None = None
    provider_model_id: str | None = None
    model_label: str
    model_version: str
    adapter_version: str | None = None
    capability_manifest_version: str | None = None
    capability_snapshot: dict[str, Any] | None = None
    output_media_type: Literal["image", "video"]
    output_asset_ids: list[int]
    provider_job_id: str | None
    estimated_cost: float | None
    cost: float = 0
    usage: dict[str, Any] = Field(default_factory=dict)
    needs_confirmation: bool = False
    confirmation_message: str | None = None
    can_retry_ingestion: bool = False
    local_ingestion_pending: bool = False
    requires_review: bool = False
    created_at: datetime | None
    updated_at: datetime | None


class DirectorGenerationEnvelope(BaseModel):
    data: DirectorGenerationResponse
    meta: dict[str, bool] | None = None


class DirectorGenerationListEnvelope(BaseModel):
    data: list[DirectorGenerationResponse]


@router.get("/director-generation-capabilities",
            operation_id="getDirectorGenerationCapabilities",
            response_model=DirectorCapabilitiesEnvelope)
def director_capabilities() -> dict:
    return {"data": director_generation_service.capabilities()}


@router.get("/director/models", operation_id="getDirectorModels",
            response_model=DirectorCapabilitiesEnvelope)
def director_models() -> dict:
    """Canonical model catalogue consumed by Director and external clients."""
    return {"data": director_generation_service.capabilities()}


@router.get("/productions/{production_id}/director-generations",
            operation_id="listDirectorGenerations",
            response_model=DirectorGenerationListEnvelope)
def list_generations(production_id: int, limit: int = 20) -> dict:
    return {"data": director_generation_service.recent(production_id, limit)}


@router.post("/productions/{production_id}/director-generations",
             operation_id="createDirectorGeneration", status_code=202,
             response_model=DirectorGenerationEnvelope)
def create_generation(production_id: int, payload: DirectorGenerationRecipe,
                      idempotency_key: str = Header(alias="Idempotency-Key")) -> dict:
    try:
        generation, created = director_generation_service.enqueue(
            production_id, payload.model_dump(),
            idempotency_key=idempotency_key)
        return {"data": generation, "meta": {"created": created}}
    except LookupError as exc:
        raise ApiProblem(404, "production_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(400, "invalid_director_generation", str(exc)) from exc


@router.post("/productions/{production_id}/director-generations/{job_id}/cancel",
             operation_id="cancelDirectorGeneration",
             response_model=DirectorGenerationEnvelope)
def cancel_generation(production_id: int, job_id: UUID) -> dict:
    try:
        return {"data": director_generation_service.cancel(production_id, job_id)}
    except LookupError as exc:
        raise ApiProblem(404, "director_generation_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(409, "director_generation_not_cancelable", str(exc)) from exc


@router.post(
    "/productions/{production_id}/director-generations/{job_id}/retry-ingestion",
    operation_id="retryDirectorGenerationIngestion",
    response_model=DirectorGenerationEnvelope,
)
def retry_generation_ingestion(production_id: int, job_id: UUID) -> dict:
    try:
        return {"data": director_generation_service.retry_ingestion(
            production_id, job_id)}
    except LookupError as exc:
        raise ApiProblem(
            404, "director_generation_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(
            409, "director_generation_not_retryable", str(exc)) from exc
