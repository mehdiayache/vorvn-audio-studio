"""Atomic Project speech commands, independent of HTTP and PostgreSQL."""

from __future__ import annotations

from typing import Any, Protocol

from origins.domain.jobs import Job


class ProjectSpeechCommandStore(Protocol):
    def enqueue(self, payload: dict[str, Any], **values) \
            -> tuple[Job, bool]: ...


class ProjectSpeechCommandService:
    def __init__(self, repository: ProjectSpeechCommandStore):
        self.repository = repository

    def enqueue(self, payload: dict[str, Any], **values) \
            -> tuple[Job, bool]:
        return self.repository.enqueue(payload, **values)
