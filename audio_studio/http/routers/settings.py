"""Native settings API with secrets deliberately excluded from responses."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field

from audio_studio.composition.settings import settings_service
from audio_studio.http.errors import ApiProblem
from audio_studio.http.settings_contracts import (
    DeletedPronunciationEnvelope,
    DiskSnapshotEnvelope,
    PronunciationListEnvelope,
    PronunciationPreviewEnvelope,
    ProviderConnectionTestEnvelope,
    SavedPronunciationEnvelope,
    SettingsSnapshotEnvelope,
    StorageTestEnvelope,
    TidyResultEnvelope,
)


router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    warn_above: float | None = Field(default=None, ge=0)
    daily_cap: float | None = Field(default=None, ge=0)
    fix_dates_phones: bool | None = None
    day_first: bool | None = None
    synth_flags: dict[str, bool] | None = None
    extra_params: str | None = None
    naming: dict[str, Any] | None = None


class ProviderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: str = ""
    region: str
    workspace_id: str = ""


class StorageUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoint: str = ""
    bucket: str = ""
    prefix: str = "text-to-voice"
    region: str = "us-east-1"
    access_key: str = ""
    secret_key: str = ""


class FreesoundSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_token: str = ""
    oauth_access_token: str = ""


class PronunciationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int | None = None
    pattern: str
    replacement: str
    whole_word: bool = True
    match_case: bool = False
    enabled: bool = True
    phoneme: bool = False


@router.get("", operation_id="getSettings",
            response_model=SettingsSnapshotEnvelope,
            response_model_exclude_none=True)
def get_settings() -> dict:
    return {"data": settings_service.snapshot()}


@router.patch("", operation_id="updateSettings",
              response_model=SettingsSnapshotEnvelope,
              response_model_exclude_none=True)
def update_settings(payload: SettingsUpdate) -> dict:
    try:
        return {"data": settings_service.update(payload.model_dump(exclude_unset=True))}
    except (OSError, ValueError) as exc:
        raise ApiProblem(400, "invalid_settings", str(exc)) from exc


@router.post("/naming/reset", operation_id="resetNaming",
             response_model=SettingsSnapshotEnvelope,
             response_model_exclude_none=True)
def reset_naming() -> dict:
    return {"data": settings_service.update({"naming": None})}


@router.patch("/provider", operation_id="updateProviderSettings",
              response_model=SettingsSnapshotEnvelope,
              response_model_exclude_none=True)
def update_provider(payload: ProviderUpdate) -> dict:
    try:
        return {"data": settings_service.update_provider(payload.model_dump())}
    except (OSError, ValueError) as exc:
        raise ApiProblem(400, "invalid_provider_settings", str(exc)) from exc


@router.patch("/providers/freesound",
              operation_id="updateFreesoundSettings",
              response_model=SettingsSnapshotEnvelope,
              response_model_exclude_none=True)
def update_freesound(payload: FreesoundSettingsUpdate) -> dict:
    try:
        return {"data": settings_service.update_audio_catalog(
            payload.model_dump())}
    except (OSError, ValueError) as exc:
        raise ApiProblem(
            400, "invalid_freesound_settings", str(exc)) from exc


@router.post("/providers/alibaba/test", operation_id="testAlibabaConnection",
             response_model=ProviderConnectionTestEnvelope,
             response_model_exclude_none=True)
def test_alibaba_connection() -> dict:
    return {"data": settings_service.test_provider()}


@router.patch("/storage", operation_id="updateStorageSettings",
              response_model=SettingsSnapshotEnvelope,
              response_model_exclude_none=True)
def update_storage(payload: StorageUpdate) -> dict:
    try:
        return {"data": settings_service.update_storage(payload.model_dump())}
    except (OSError, ValueError) as exc:
        raise ApiProblem(400, "invalid_storage_settings", str(exc)) from exc


@router.post("/storage/test", operation_id="testStorageSettings",
             response_model=StorageTestEnvelope,
             response_model_exclude_none=True)
def test_storage() -> dict:
    return {"data": settings_service.test_storage()}


@router.get("/maintenance", operation_id="getMaintenanceSettings",
            response_model=DiskSnapshotEnvelope,
            response_model_exclude_none=True)
def get_maintenance() -> dict:
    return {"data": settings_service.maintenance_snapshot()}


@router.post("/maintenance/tidy", operation_id="tidyWorkingFiles",
             response_model=TidyResultEnvelope,
             response_model_exclude_none=True)
def tidy_working_files(days: int = Query(7, ge=0, le=365)) -> dict:
    return {"data": settings_service.tidy_working_files(days)}


@router.get("/pronunciations", operation_id="listPronunciations",
            response_model=PronunciationListEnvelope,
            response_model_exclude_none=True)
def list_pronunciations() -> dict:
    return {"data": settings_service.pronunciations()}


@router.post("/pronunciations", operation_id="savePronunciation",
             response_model=SavedPronunciationEnvelope,
             response_model_exclude_none=True)
def save_pronunciation(payload: PronunciationUpdate) -> dict:
    try:
        item_id = settings_service.save_pronunciation(payload.model_dump())
        return {"data": {
            "id": item_id, "rules": settings_service.pronunciations()}}
    except ValueError as exc:
        raise ApiProblem(400, "invalid_pronunciation", str(exc)) from exc


@router.delete("/pronunciations/{item_id}", operation_id="deletePronunciation",
               response_model=DeletedPronunciationEnvelope,
               response_model_exclude_none=True)
def delete_pronunciation(item_id: int) -> dict:
    if not settings_service.delete_pronunciation(item_id):
        raise ApiProblem(404, "pronunciation_not_found", "That pronunciation rule no longer exists.")
    return {"data": {"deleted": True}}


@router.get("/pronunciations/preview", operation_id="previewPronunciation",
            response_model=PronunciationPreviewEnvelope,
            response_model_exclude_none=True)
def preview_pronunciation(text: str = Query("", max_length=5000)) -> dict:
    return {"data": settings_service.pronunciation_preview(text)}
