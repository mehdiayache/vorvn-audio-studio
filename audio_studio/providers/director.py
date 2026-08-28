"""Small provider/model boundaries for Director generation."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol


class DirectorProviderError(RuntimeError):
    """Human-safe provider failure."""


class DirectorProviderSetupError(DirectorProviderError):
    """Missing or rejected provider configuration."""


@dataclass(frozen=True, slots=True)
class DirectorSubmission:
    provider_job_id: str


@dataclass(frozen=True, slots=True)
class DirectorProviderState:
    state: str
    output_urls: tuple[str, ...] = ()
    error: str = ""
    raw: dict[str, Any] | None = None
    progress: int | None = None


class DirectorProvider(Protocol):
    provider_id: str

    def configured(self) -> bool: ...
    def status(self) -> dict[str, Any]: ...
    def submit(self, request: dict[str, Any]) -> DirectorSubmission: ...
    def task(self, provider_job_id: str) -> DirectorProviderState: ...
    def download(self, url: str, target: Path) -> int: ...
    def cancel(self, provider_job_id: str) -> None: ...


class DirectorModelAdapter(Protocol):
    provider_id: str

    def request(
        self, *, model: dict[str, Any], operation: dict[str, Any],
        recipe: dict[str, Any], materialized_inputs: list[dict[str, Any]],
        materialized_parameters: dict[str, Any],
    ) -> dict[str, Any]: ...
