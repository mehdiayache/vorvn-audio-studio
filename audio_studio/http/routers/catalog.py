"""Native model, voice and application catalogues."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

import db
from audio_studio.application import catalog


router = APIRouter(prefix="/api/v1", tags=["catalog"])


class VoiceRouteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    voice_identity_id: str | None = None
    voice: str = ""
    engine: str = "audio"
    model: str = "plus"
    language: str = "Auto"
    text: str = ""


@router.get("/config", operation_id="getStudioConfig")
def get_config() -> dict:
    return {"data": catalog.configuration()}


@router.get("/voice-registry", operation_id="getVoiceRegistry")
def get_voice_registry() -> dict:
    return {"data": catalog.registry()}


@router.get("/voice-usage", operation_id="getVoiceUsage")
def get_voice_usage() -> dict:
    return {"data": db.voice_usage()}


@router.get("/voice-meta", operation_id="getVoiceMeta")
def get_voice_meta() -> dict:
    return {"data": db.voice_meta()}


@router.post("/voice-routes/resolve", operation_id="resolveVoiceRoute")
def resolve_voice_route(payload: VoiceRouteRequest) -> dict[str, Any]:
    return {"data": catalog.resolve_voice(payload.model_dump())}
