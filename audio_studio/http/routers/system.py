"""Native system and readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter

import db
from audio_studio import __version__


router = APIRouter(prefix="/api/v1/system", tags=["system"])


@router.get("/health", operation_id="getSystemHealth")
def health() -> dict:
    database = db.status()
    return {"data": {"name": "VORVN Audio Studio", "version": __version__,
                     "status": "ok" if database.get("connected") else "degraded",
                     "database": database}}
