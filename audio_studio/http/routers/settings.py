"""Native settings API with secrets deliberately excluded from responses."""

from __future__ import annotations

from typing import Any

import db
import storage
from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field

from audio_studio.application import settings as settings_service
from audio_studio.application import administration
from audio_studio.http.errors import ApiProblem


router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    output_directory: str | None = None
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
    public_url: str = ""
    access_key: str = ""
    secret_key: str = ""


class PronunciationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int | None = None
    pattern: str
    replacement: str
    whole_word: bool = True
    match_case: bool = False
    enabled: bool = True
    phoneme: bool = False


@router.get("", operation_id="getSettings")
def get_settings() -> dict:
    return {"data": settings_service.snapshot()}


@router.patch("", operation_id="updateSettings")
def update_settings(payload: SettingsUpdate) -> dict:
    try:
        return {"data": settings_service.update(payload.model_dump(exclude_unset=True))}
    except (OSError, ValueError) as exc:
        raise ApiProblem(400, "invalid_settings", str(exc)) from exc


@router.post("/naming/reset", operation_id="resetNaming")
def reset_naming() -> dict:
    return {"data": settings_service.update({"naming": None})}


@router.patch("/provider", operation_id="updateProviderSettings")
def update_provider(payload: ProviderUpdate) -> dict:
    try:
        administration.update_provider(payload.model_dump())
        return {"data": settings_service.snapshot()}
    except (OSError, ValueError) as exc:
        raise ApiProblem(400, "invalid_provider_settings", str(exc)) from exc


@router.patch("/storage", operation_id="updateStorageSettings")
def update_storage(payload: StorageUpdate) -> dict:
    try:
        administration.update_storage(payload.model_dump())
        return {"data": settings_service.snapshot()}
    except (OSError, ValueError) as exc:
        raise ApiProblem(400, "invalid_storage_settings", str(exc)) from exc


@router.post("/storage/test", operation_id="testStorageSettings")
def test_storage() -> dict:
    return {"data": storage.status()}


@router.get("/maintenance", operation_id="getMaintenanceSettings")
def get_maintenance() -> dict:
    return {"data": administration.disk_snapshot()}


@router.post("/maintenance/tidy", operation_id="tidyWorkingFiles")
def tidy_working_files(days: int = Query(7, ge=0, le=365)) -> dict:
    return {"data": administration.tidy_working_files(days)}


@router.get("/pronunciations", operation_id="listPronunciations")
def list_pronunciations() -> dict:
    return {"data": administration.pronunciations()}


@router.post("/pronunciations", operation_id="savePronunciation")
def save_pronunciation(payload: PronunciationUpdate) -> dict:
    try:
        item_id = administration.save_pronunciation(payload.model_dump())
        return {"data": {"id": item_id, "rules": administration.pronunciations()}}
    except ValueError as exc:
        raise ApiProblem(400, "invalid_pronunciation", str(exc)) from exc


@router.delete("/pronunciations/{item_id}", operation_id="deletePronunciation")
def delete_pronunciation(item_id: int) -> dict:
    if not db.pronunciation_delete(item_id):
        raise ApiProblem(404, "pronunciation_not_found", "That pronunciation rule no longer exists.")
    return {"data": {"deleted": True}}


@router.get("/pronunciations/preview", operation_id="previewPronunciation")
def preview_pronunciation(text: str = Query("", max_length=5000)) -> dict:
    return {"data": administration.pronunciation_preview(text)}
