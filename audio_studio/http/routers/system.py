"""Native system and readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from audio_studio.application import system


router = APIRouter(prefix="/api/v1/system", tags=["system"])


@router.get("/health", operation_id="getSystemHealth")
def health() -> dict:
    return {"data": system.health()}
