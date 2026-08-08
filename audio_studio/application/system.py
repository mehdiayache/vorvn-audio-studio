"""System health use cases."""

from __future__ import annotations

from audio_studio import __version__
from audio_studio.infrastructure.postgres.control_plane import (
    ControlPlaneRepository,
)


repository = ControlPlaneRepository()


def health() -> dict:
    database = repository.database_status()
    return {
        "name": "VORVN Audio Studio", "version": __version__,
        "status": "ok" if database.get("connected") else "degraded",
        "database": database,
    }
