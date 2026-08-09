"""System health use cases."""

from __future__ import annotations

from audio_studio import __version__
from audio_studio.infrastructure.postgres.control_plane import (
    ControlPlaneRepository,
)
from audio_studio.infrastructure.postgres.worker_runtime import WorkerRuntimeRepository


repository = ControlPlaneRepository()
worker_repository = WorkerRuntimeRepository()


def health() -> dict:
    database = repository.database_status()
    worker = (worker_repository.status() if database.get("connected") else
              {"ready": False, "status": "database_unavailable"})
    return {
        "name": "VORVN Audio Studio", "version": __version__,
        "status": "ok" if database.get("connected") and worker["ready"] else "degraded",
        "database": database, "worker": worker,
    }
