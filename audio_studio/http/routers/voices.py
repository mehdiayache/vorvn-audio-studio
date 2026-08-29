"""Native voice identity API. Provider voice creation remains a Job adapter."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field

from audio_studio.composition.voices import voice_service
from audio_studio.composition.jobs import job_service
from audio_studio.composition.catalog import catalog_service
from audio_studio.domain.speech import DEFAULT_SPEECH_VOLUME
from audio_studio.http.errors import ApiProblem
from audio_studio.http.voice_contracts import (
    HistoricalVoiceCollectionEnvelope,
    VoiceHistoryLinkEnvelope,
    VoicePackageCreateEnvelope,
    VoicePackagePlanEnvelope,
    VoicePackageRetryEnvelope,
    VoiceProfileCollectionEnvelope,
    VoiceProfileEnvelope,
    VoicePreviewCreatedEnvelope,
    VoiceReferenceWindowEnvelope,
)


router = APIRouter(prefix="/api/v1", tags=["voices"])


class VoiceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, max_length=80)
    image: str | None = Field(default=None, max_length=1000)
    gender: str | None = Field(default=None, max_length=160)
    age: int | None = Field(default=None, ge=1, le=120)
    accent: str | None = Field(default=None, max_length=160)
    trait: str | None = Field(default=None, max_length=160)
    scene: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=1000)
    editorial_language: str | None = Field(default=None, max_length=160)
    favourite: bool | None = None
    status: str | None = None


class HistoryLink(BaseModel):
    provider_voice_id: str = Field(min_length=1, max_length=300)


class VoicePackagePreflight(BaseModel):
    model_config = ConfigDict(extra="forbid")
    language: str = Field(min_length=1, max_length=80)
    package: str = Field(default="complete", max_length=40)


class VoicePackageCreate(VoicePackagePreflight):
    name: str = Field(min_length=1, max_length=80)
    reference_id: str = Field(min_length=1, max_length=120)
    identity_id: str | None = Field(default=None, max_length=120)
    gender: str | None = Field(default=None, max_length=160)
    trait: str | None = Field(default=None, max_length=160)
    editorial_language: str | None = Field(default=None, max_length=160)
    provider_model_ids: list[str] | None = Field(default=None, max_length=20)
    reference_window_id: str | None = Field(default=None, max_length=120)
    reference_window_ids: dict[str, str] | None = None
    confirmed: bool = False


class VoiceReferenceWindowUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider_model_id: str | None = Field(default=None, max_length=160)
    start_ms: int = Field(ge=0)
    duration_ms: int = Field(ge=1_000, le=60_000)
    source_language: str = Field(default="", max_length=80)
    transcript: str = Field(default="", max_length=20_000)
    enable_preprocess: bool | None = None


class VoicePreviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    binding_id: UUID
    tag: str | None = Field(default=None, max_length=40)
    text: str = Field(min_length=1, max_length=1_000)
    instruction: str = Field(default="", max_length=1_000)
    seed: int = Field(default=0, ge=0, le=2_147_483_647)
    language: str = Field(default="Auto", max_length=80)


class VoicePreviewApproval(BaseModel):
    approval_state: Literal["unreviewed", "approved", "rejected"]


class VoicePackageRetry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enrollment_job_id: str = Field(min_length=1, max_length=200)


@router.get(
    "/voices", operation_id="listVoiceProfiles",
    response_model=VoiceProfileCollectionEnvelope,
)
def list_profiles(limit: int = Query(100, ge=1, le=100), after: str | None = None) -> dict:
    # Voice catalogues are intentionally bounded below the public page limit.
    # Keep the cursor field so API clients and the React collection helper use
    # one consistent collection envelope.
    items = voice_service.profiles()
    if after:
        raise ApiProblem(400, "invalid_cursor", "The voice catalogue has no further page.")
    page = items[:limit]
    return {"data": page, "meta": {"count": len(page), "total": len(items),
                                      "next_cursor": None}}


@router.get(
    "/voices/{identity_id}", operation_id="getVoiceProfile",
    response_model=VoiceProfileEnvelope,
)
def get_profile(identity_id: str) -> dict:
    item = voice_service.profile(identity_id)
    if not item:
        raise ApiProblem(404, "voice_not_found", "That voice identity does not exist.")
    return {"data": item}


@router.patch(
    "/voices/{identity_id}", operation_id="updateVoiceProfile",
    response_model=VoiceProfileEnvelope,
)
def update_profile(identity_id: str, payload: VoiceUpdate) -> dict:
    try:
        item = voice_service.update(
            identity_id, payload.model_dump(exclude_none=True))
    except ValueError as exc:
        raise ApiProblem(400, "invalid_voice", str(exc)) from exc
    if not item:
        raise ApiProblem(404, "voice_not_found", "That voice identity does not exist.")
    return {"data": item}


@router.put(
    "/voice-references/{reference_id}/window",
    operation_id="saveUploadedVoiceReferenceWindow",
    response_model=VoiceReferenceWindowEnvelope,
)
def save_uploaded_reference_window(reference_id: str,
                                   payload: VoiceReferenceWindowUpdate) -> dict:
    try:
        result = voice_service.save_uploaded_reference_window(
            reference_id, payload.model_dump())
    except LookupError as exc:
        raise ApiProblem(404, "voice_source_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(400, "invalid_voice_source_window", str(exc)) from exc
    return {"data": result}


@router.put(
    "/voices/{identity_id}/references/{reference_id}/window",
    operation_id="saveVoiceReferenceWindow",
    response_model=VoiceProfileEnvelope,
)
def save_reference_window(identity_id: str, reference_id: str,
                          payload: VoiceReferenceWindowUpdate) -> dict:
    try:
        item = voice_service.save_reference_window(
            identity_id, reference_id, payload.model_dump())
    except LookupError as exc:
        raise ApiProblem(404, "voice_source_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(400, "invalid_voice_source_window", str(exc)) from exc
    return {"data": item}


@router.post(
    "/voices/{identity_id}/previews", operation_id="createVoicePreview",
    status_code=202, response_model=VoicePreviewCreatedEnvelope,
)
def create_voice_preview(identity_id: str, payload: VoicePreviewCreate) -> dict:
    values = {
        "text": payload.text.strip(),
        "text_raw": payload.text.strip(),
        "text_tagged": payload.text.strip() if payload.tag else None,
        "text_state": "tagged" if payload.tag else "raw",
        "binding_id": str(payload.binding_id),
        "language": payload.language,
        "instruction": payload.instruction.strip(),
        "seed": payload.seed,
        "format": "mp3",
        "speech_mode": "performance" if payload.tag else "exact",
        "rate": 1, "pitch": 1, "volume": DEFAULT_SPEECH_VOLUME,
        "_voice_preview": True,
    }
    try:
        resolved = catalog_service.resolve_voice(values)
    except ValueError as exc:
        raise ApiProblem(409, "voice_route_unavailable", str(exc)) from exc
    if resolved.get("identity_id") != identity_id:
        raise ApiProblem(400, "invalid_voice_preview",
                         "That recording method belongs to another Voice.")
    values.update({
        "voice": resolved["provider_voice_id"],
        "voice_identity_id": resolved.get("identity_id"),
        "engine": resolved["engine"], "model": resolved["tier"],
        "capability_id": resolved.get("capability_id"),
    })
    job, _ = job_service.enqueue(
        "speech", values,
        idempotency_key=f"voice-preview-{uuid4()}",
        source_tool="voices", operation_label="Test voice",
    )
    try:
        preview_id = voice_service.record_preview(
            identity_id, str(payload.binding_id), job_id=job.id,
            tag=payload.tag, text=payload.text.strip(),
            instruction=payload.instruction.strip(), seed=payload.seed)
    except LookupError as exc:
        raise ApiProblem(400, "invalid_voice_preview", str(exc)) from exc
    return {"data": {"preview_id": preview_id,
                     "job_id": str(job.public_id)}}


@router.patch(
    "/voices/{identity_id}/previews/{preview_id}",
    operation_id="approveVoicePreview", response_model=VoiceProfileEnvelope,
)
def approve_voice_preview(identity_id: str, preview_id: UUID,
                          payload: VoicePreviewApproval) -> dict:
    try:
        profile = voice_service.approve_preview(
            identity_id, str(preview_id), payload.approval_state)
    except LookupError as exc:
        raise ApiProblem(404, "voice_preview_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(409, "voice_preview_not_ready", str(exc)) from exc
    return {"data": profile}


@router.delete(
    "/voices/{identity_id}", operation_id="archiveVoiceProfile",
    response_model=VoiceProfileEnvelope,
)
def archive_profile(identity_id: str) -> dict:
    item = voice_service.archive(identity_id)
    if not item:
        raise ApiProblem(404, "voice_not_found", "That voice identity does not exist.")
    return {"data": item}


@router.get(
    "/voice-history/unlinked", operation_id="listUnlinkedVoiceHistory",
    response_model=HistoricalVoiceCollectionEnvelope,
)
def list_unlinked_history(limit: int = Query(100, ge=1, le=100), after: str | None = None) -> dict:
    if after:
        raise ApiProblem(400, "invalid_cursor", "The history catalogue has no further page.")
    items = voice_service.unlinked_history()[:limit]
    return {"data": items, "meta": {"count": len(items), "total": len(items),
                                       "next_cursor": None}}


@router.post(
    "/voices/{identity_id}/link-history", operation_id="linkVoiceHistory",
    response_model=VoiceHistoryLinkEnvelope,
)
def link_history(identity_id: str, payload: HistoryLink) -> dict[str, Any]:
    try:
        result = voice_service.link_history(
            identity_id, payload.provider_voice_id.strip())
    except ValueError as exc:
        raise ApiProblem(400, "invalid_voice_history", str(exc)) from exc
    if not result:
        raise ApiProblem(404, "voice_history_not_found",
                         "No unlinked history exists for that provider voice.")
    return {"data": result}


@router.post(
    "/voice-packages/preflight", operation_id="preflightVoicePackage",
    response_model=VoicePackagePlanEnvelope,
)
def preflight_voice_package(payload: VoicePackagePreflight) -> dict:
    try:
        return {"data": voice_service.package_plan(
            payload.language, payload.package)}
    except ValueError as exc:
        raise ApiProblem(400, "invalid_voice_package", str(exc)) from exc


@router.post(
    "/voice-packages", operation_id="createVoicePackage", status_code=202,
    response_model=VoicePackageCreateEnvelope,
)
def create_voice_package(payload: VoicePackageCreate) -> dict:
    try:
        result = voice_service.create_package(
            payload.model_dump(exclude_none=True))
    except PermissionError as exc:
        raise ApiProblem(402, "daily_cap_reached", str(exc)) from exc
    except LookupError as exc:
        raise ApiProblem(404, "voice_not_found", str(exc)) from exc
    except RuntimeError as exc:
        raise ApiProblem(409, "voice_package_conflict", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(400, "invalid_voice_package", str(exc)) from exc
    return {"data": result}


@router.post(
    "/voice-packages/retry", operation_id="retryVoicePackage",
    status_code=202, response_model=VoicePackageRetryEnvelope,
)
def retry_voice_package(payload: VoicePackageRetry) -> dict:
    result = voice_service.retry_binding(payload.enrollment_job_id)
    if not result:
        raise ApiProblem(409, "voice_package_not_retryable",
                         "That failed variant is no longer retryable.")
    return {"data": result}
