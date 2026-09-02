"""System health use case behind database and worker status ports."""

from __future__ import annotations

from typing import Protocol

from origins import __version__
from origins.config import settings


class DatabaseStatus(Protocol):
    def database_status(self) -> dict: ...


class WorkerStatus(Protocol):
    def status(self, stale_seconds: int = 10) -> dict: ...


class SystemService:
    def __init__(self, database: DatabaseStatus, worker: WorkerStatus):
        self.database = database
        self.worker = worker

    def health(self) -> dict:
        database = self.database.database_status()
        worker = (self.worker.status() if database.get("connected") else
                  {"ready": False, "status": "database_unavailable"})
        return {
            "name": settings.name, "version": __version__,
            "status": (
                "ok" if database.get("connected") and worker["ready"]
                else "degraded"),
            "database": database, "worker": worker,
        }
