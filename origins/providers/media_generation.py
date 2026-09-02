"""Small provider/model boundaries for Media generation."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol


class MediaGenerationProviderError(RuntimeError):
    """Human-safe provider failure."""


class MediaGenerationProviderSetupError(MediaGenerationProviderError):
    """Missing or rejected provider configuration."""


@dataclass(frozen=True, slots=True)
class MediaGenerationSubmission:
    provider_job_id: str


@dataclass(frozen=True, slots=True)
class MediaGenerationProviderState:
    state: str
    output_urls: tuple[str, ...] = ()
    error: str = ""
    raw: dict[str, Any] | None = None
    progress: int | None = None


class MediaGenerationProvider(Protocol):
    provider_id: str

    def configured(self) -> bool: ...
    def status(self) -> dict[str, Any]: ...
    def callback_configured(self) -> bool: ...
    def estimate_cost(self, request: dict[str, Any]) -> float: ...
    def submit(
        self, request: dict[str, Any], *, callback_reference: str | None = None,
    ) -> MediaGenerationSubmission: ...
    def accounting(
        self, state: MediaGenerationProviderState,
    ) -> tuple[float, dict[str, Any]]: ...
    def task(self, provider_job_id: str) -> MediaGenerationProviderState: ...
    def state_from_callback(
        self, payload: dict[str, Any],
    ) -> MediaGenerationProviderState: ...
    def download(self, url: str, target: Path) -> int: ...
    def cancel(self, provider_job_id: str) -> None: ...


class MediaModelAdapter(Protocol):
    provider_id: str

    def request(
        self, *, model: dict[str, Any], operation: dict[str, Any],
        preset: dict[str, Any], materialized_inputs: list[dict[str, Any]],
        materialized_parameters: dict[str, Any],
    ) -> dict[str, Any]: ...
