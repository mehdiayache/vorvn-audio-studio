"""Native model, voice and application catalogues."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from audio_studio.composition.catalog import catalog_service
from audio_studio.http.errors import ApiProblem
from audio_studio.http.catalog_contracts import (
    StudioConfigEnvelope,
    VoiceMetadataEnvelope,
    VoiceRegistryEnvelope,
    VoiceRouteEnvelope,
    VoiceUsageEnvelope,
)


router = APIRouter(prefix="/api/v1", tags=["catalog"])


class VoiceRouteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    voice_identity_id: str | None = None
    voice: str = ""
    engine: str = "audio"
    model: str = "plus"
    language: str = "Auto"
    text: str = ""


@router.get(
    "/config", operation_id="getStudioConfig",
    response_model=StudioConfigEnvelope,
)
def get_config() -> dict:
    return {"data": catalog_service.configuration()}


@router.get(
    "/voice-registry", operation_id="getVoiceRegistry",
    response_model=VoiceRegistryEnvelope,
)
def get_voice_registry() -> dict:
    return {"data": catalog_service.registry()}


@router.get(
    "/voice-usage", operation_id="getVoiceUsage",
    response_model=VoiceUsageEnvelope,
)
def get_voice_usage() -> dict:
    return {"data": catalog_service.voice_usage()}


@router.get(
    "/voice-meta", operation_id="getVoiceMeta",
    response_model=VoiceMetadataEnvelope,
)
def get_voice_meta() -> dict:
    return {"data": catalog_service.voice_metadata()}


@router.post(
    "/voice-routes/resolve", operation_id="resolveVoiceRoute",
    response_model=VoiceRouteEnvelope,
)
def resolve_voice_route(payload: VoiceRouteRequest) -> dict[str, Any]:
    try:
        return {"data": catalog_service.resolve_voice(payload.model_dump())}
    except ValueError as exc:
        raise ApiProblem(
            409, "voice_route_unavailable", str(exc),
            {"voice_identity_id": payload.voice_identity_id,
             "engine": payload.engine, "model": payload.model,
             "language": payload.language},
        ) from exc
