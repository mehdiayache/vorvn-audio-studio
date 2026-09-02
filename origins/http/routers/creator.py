"""Capabilities and durable provider generations for Creator."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Header
from pydantic import BaseModel, ConfigDict, Field, model_validator

from origins.composition.media_generation import media_generation_service
from origins.http.errors import ApiProblem


router = APIRouter(prefix="/api/v1", tags=["media-generations"])


class CreatorInputSlot(BaseModel):
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


class CreatorPromptCapability(BaseModel):
    supported: bool
    required: bool
    negative_prompt: bool
    max_length: int = 20_000


class CreatorParameterCapability(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str
    type: Literal[
        "boolean", "integer", "number", "select", "text", "textarea",
        "file_list", "structured_shots",
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


class CreatorDurationRange(BaseModel):
    min: int
    max: int
    step: int
    default: int


class CreatorOutputCapability(BaseModel):
    mime_type: str
    extension: str


class CreatorControlRule(BaseModel):
    when: dict[str, Any] = Field(default_factory=dict)
    values: list[str]
    default: str


class CreatorOperationCapability(BaseModel):
    operation: str
    output_media_type: Literal["image", "video"]
    prompt: CreatorPromptCapability
    inputs: list[CreatorInputSlot]
    input_order: list[str] = Field(default_factory=list)
    input_modes: list[dict[str, Any]] = Field(default_factory=list)
    required_any_of: list[list[str]] = Field(default_factory=list)
    ratios: list[str]
    ratio_rules: list[CreatorControlRule] = Field(default_factory=list)
    resolutions: list[str]
    durations: list[int]
    duration_range: CreatorDurationRange | None = None
    fps: list[int]
    supports_seed: bool
    supports_cancel: bool
    parameters: list[CreatorParameterCapability] = Field(default_factory=list)
    output: CreatorOutputCapability


class MediaModelCapability(BaseModel):
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
    presentation: dict[str, str] = Field(default_factory=dict)
    operations: list[CreatorOperationCapability]


class CreatorOperationInfo(BaseModel):
    id: str
    label: str
    detail: str
    presentation: dict[str, str]


class CreatorCapabilities(BaseModel):
    providers: list[dict[str, str]]
    operations: list[CreatorOperationInfo]
    models: list[MediaModelCapability]


class CreatorCapabilitiesEnvelope(BaseModel):
    data: CreatorCapabilities


class MediaGenerationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    file_id: int = Field(gt=0)
    role: str = Field(min_length=1, max_length=80)
    media_type: Literal["image", "video", "audio"]
    position: int = Field(ge=0)


class MediaGenerationControls(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ratio: str = ""
    resolution: str = ""
    duration: int | None = Field(default=None, gt=0)
    fps: int | None = Field(default=None, gt=0)
    seed: int | None = Field(default=None, ge=0)
    provider_parameters: dict[str, Any] = Field(default_factory=dict)


class MediaGenerationPreset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: str = Field(min_length=1, max_length=80)
    model_id: str = Field(min_length=1, max_length=120)
    prompt: str = Field(default="", max_length=20_000)
    negative_prompt: str = Field(default="", max_length=20_000)
    inputs: list[MediaGenerationInput] = Field(default_factory=list, max_length=100)
    controls: MediaGenerationControls


class CreatorContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: int = Field(gt=0)
    folder_id: int | None = Field(default=None, gt=0)
    project_id: int | None = Field(default=None, gt=0)
    project_type: str | None = Field(default=None, min_length=1, max_length=80)
    object_id: int | None = Field(default=None, gt=0)
    selection: dict[str, Any] = Field(default_factory=dict)


class CreatorInputCompatibilityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    context: CreatorContext
    model_id: str = Field(min_length=1, max_length=120)
    operation: str = Field(min_length=1, max_length=80)
    role: str | None = Field(default=None, min_length=1, max_length=80)
    parameter_key: str | None = Field(
        default=None, min_length=1, max_length=80)
    variant_id: str | None = Field(default=None, min_length=1, max_length=80)
    audio: bool = False
    file_ids: list[int] = Field(max_length=500)

    @model_validator(mode="after")
    def exact_target(self):
        direct, nested = self.role is not None, self.parameter_key is not None
        if direct == nested:
            raise ValueError(
                "Choose exactly one direct slot or nested media parameter.")
        if direct and (self.variant_id is not None or self.audio):
            raise ValueError("Direct slots do not accept nested media selectors.")
        if nested and ((self.variant_id is None) == (not self.audio)):
            raise ValueError(
                "Choose exactly one nested subject variant or audio target.")
        return self


class CreatorInputCompatibilityResponse(BaseModel):
    file_id: int
    state: Literal["compatible", "incompatible", "unknown"]
    reasons: list[str]


class CreatorInputCompatibilityEnvelope(BaseModel):
    data: list[CreatorInputCompatibilityResponse]


class MediaGenerationResponse(BaseModel):
    id: str
    job_id: str
    status: Literal["queued", "generating", "ready", "canceled", "failed"]
    progress: int
    detail: str
    error: str | None
    preset: MediaGenerationPreset
    provider: str
    provider_id: str | None = None
    provider_model_id: str | None = None
    model_label: str
    model_version: str
    adapter_version: str | None = None
    capability_manifest_version: str | None = None
    capability_snapshot: dict[str, Any] | None = None
    output_media_type: Literal["image", "video"]
    output_file_ids: list[int]
    provider_job_id: str | None
    estimated_cost: float | None
    cost: float | None = None
    usage: dict[str, Any] = Field(default_factory=dict)
    needs_confirmation: bool = False
    confirmation_message: str | None = None
    can_retry_ingestion: bool = False
    local_ingestion_pending: bool = False
    requires_review: bool = False
    created_at: datetime | None
    updated_at: datetime | None


class MediaGenerationEnvelope(BaseModel):
    data: MediaGenerationResponse
    meta: dict[str, bool] | None = None


class MediaGenerationListEnvelope(BaseModel):
    data: list[MediaGenerationResponse]


class CreatorGenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    context: CreatorContext
    preset: MediaGenerationPreset


@router.get("/creator/capabilities",
            operation_id="getMediaGenerationCapabilities",
            response_model=CreatorCapabilitiesEnvelope)
def creator_capabilities() -> dict:
    return {"data": media_generation_service.capabilities()}


@router.get("/creator/models", operation_id="getMediaModels",
            response_model=CreatorCapabilitiesEnvelope)
def media_models() -> dict:
    """Canonical model catalogue consumed by Creator and external clients."""
    return {"data": media_generation_service.capabilities()}


@router.post(
    "/creator/input-compatibility",
    operation_id="checkCreatorInputCompatibility",
    response_model=CreatorInputCompatibilityEnvelope,
)
def check_creator_input_compatibility(
    payload: CreatorInputCompatibilityRequest,
) -> dict:
    try:
        return {"data": media_generation_service.input_compatibility(
            payload.context.model_dump(exclude_none=True),
            payload.model_id, payload.operation,
            payload.file_ids, role=payload.role,
            parameter_key=payload.parameter_key,
            variant_id=payload.variant_id, audio=payload.audio)}
    except LookupError as exc:
        raise ApiProblem(404, "project_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(400, "invalid_creator_input", str(exc)) from exc


@router.get("/creator/generations",
            operation_id="listMediaGenerations",
            response_model=MediaGenerationListEnvelope)
def list_generations(
    workspace_id: int, project_id: int | None = None, limit: int = 20,
) -> dict:
    context = {"workspace_id": workspace_id}
    if project_id is not None:
        context.update({"project_id": project_id, "project_type": "audiovisual"})
    return {"data": media_generation_service.recent(context, limit)}


@router.post("/creator/generations",
             operation_id="createMediaGeneration", status_code=202,
             response_model=MediaGenerationEnvelope)
def create_generation(payload: CreatorGenerationRequest,
                      idempotency_key: str = Header(alias="Idempotency-Key")) -> dict:
    try:
        generation, created = media_generation_service.enqueue(
            payload.context.model_dump(exclude_none=True),
            payload.preset.model_dump(),
            idempotency_key=idempotency_key)
        return {"data": generation, "meta": {"created": created}}
    except LookupError as exc:
        raise ApiProblem(404, "project_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(400, "invalid_media_generation", str(exc)) from exc


@router.post("/creator/generations/{job_id}/cancel",
             operation_id="cancelMediaGeneration",
             response_model=MediaGenerationEnvelope)
def cancel_generation(job_id: UUID, context: CreatorContext) -> dict:
    try:
        return {"data": media_generation_service.cancel(
            context.model_dump(exclude_none=True), job_id)}
    except LookupError as exc:
        raise ApiProblem(404, "media_generation_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(409, "media_generation_not_cancelable", str(exc)) from exc


@router.post(
    "/creator/generations/{job_id}/retry-ingestion",
    operation_id="retryMediaGenerationIngestion",
    response_model=MediaGenerationEnvelope,
)
def retry_generation_ingestion(job_id: UUID, context: CreatorContext) -> dict:
    try:
        return {"data": media_generation_service.retry_ingestion(
            context.model_dump(exclude_none=True), job_id)}
    except LookupError as exc:
        raise ApiProblem(
            404, "media_generation_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(
            409, "media_generation_not_retryable", str(exc)) from exc
