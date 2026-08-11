"""Exact voice-enrollment dispatch with no provider/model fallback."""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Protocol

from audio_studio.domain.voice_packages import CreatedVoiceBinding, VoicePackageJob


class EnrollmentAdapter(Protocol):
    def estimated_cost(self, job: VoicePackageJob) -> float: ...
    def create(self, job: VoicePackageJob,
               local: Path, on_sent: Callable[[], None]
               ) -> CreatedVoiceBinding: ...


class ExactEnrollmentProviderRegistry:
    """Dispatch one persisted provider-model route to its exact adapter."""

    def __init__(self, adapters: dict[tuple[str, str], EnrollmentAdapter]):
        self._adapters = dict(adapters)

    def estimated_cost(self, job: VoicePackageJob) -> float:
        return self._adapter(job).estimated_cost(job)

    def create(self, job: VoicePackageJob,
               local: Path, on_sent: Callable[[], None]
               ) -> CreatedVoiceBinding:
        result = self._adapter(job).create(job, local, on_sent)
        if result.provider_region != job.region:
            raise RuntimeError(
                "The enrollment adapter changed the exact requested region.")
        return result

    def _adapter(self, job: VoicePackageJob) -> EnrollmentAdapter:
        adapter = self._adapters.get((job.provider, job.adapter_key))
        if not adapter:
            raise ValueError(
                "No enrollment adapter is installed for "
                f"{job.provider}:{job.adapter_key}.")
        return adapter
