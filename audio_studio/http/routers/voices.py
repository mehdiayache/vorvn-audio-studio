"""Native voice identity API. Provider voice creation remains a Job adapter."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field

from audio_studio.composition.voices import voice_service
from audio_studio.http.errors import ApiProblem
from audio_studio.http.voice_contracts import (
    HistoricalVoiceCollectionEnvelope,
    VoiceHistoryLinkEnvelope,
    VoicePackageCreateEnvelope,
    VoicePackagePlanEnvelope,
    VoicePackageRetryEnvelope,
    VoiceProfileCollectionEnvelope,
    VoiceProfileEnvelope,
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
    recording_language: str | None = Field(default=None, max_length=160)
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
    confirmed: bool = False


class VoicePackageRetry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    identity_id: str = Field(min_length=1, max_length=120)
    model_id: str = Field(min_length=1, max_length=200)


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
    result = voice_service.retry_binding(payload.identity_id, payload.model_id)
    if not result:
        raise ApiProblem(409, "voice_package_not_retryable",
                         "That failed variant is no longer retryable.")
    return {"data": result}
