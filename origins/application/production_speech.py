"""Atomic Production speech commands, independent of HTTP and PostgreSQL."""

from __future__ import annotations

from typing import Any, Protocol

from origins.domain.jobs import Job


class ProductionSpeechCommandStore(Protocol):
    def enqueue(self, payload: dict[str, Any], **values) \
            -> tuple[Job, bool]: ...


class ProductionSpeechCommandService:
    def __init__(self, repository: ProductionSpeechCommandStore):
        self.repository = repository

    def enqueue(self, payload: dict[str, Any], **values) \
            -> tuple[Job, bool]:
        return self.repository.enqueue(payload, **values)
