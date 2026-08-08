"""Operator Activity use cases built from the durable Job ledger."""

from __future__ import annotations

from audio_studio.infrastructure.postgres.activity import ActivityRepository


repository = ActivityRepository()


def snapshot(*, limit: int = 80, kind: str = "",
             failed_only: bool = False) -> dict:
    repository.abandon_stale()
    return repository.snapshot(limit=limit, kind=kind, failed_only=failed_only)
