"""Small provider interfaces owned by Audio Studio, never by a vendor SDK."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from audio_studio.domain.speech import PreparedSpeech, SynthesizedSpeech


@dataclass(frozen=True, slots=True)
class AudioResult:
    audio: bytes
    duration_ms: int | None = None
    output_format: str = "wav"
    metadata: dict = field(default_factory=dict)


class BaseTTSProvider(ABC):
    """Two-phase TTS contract so cost approval happens before a paid call."""

    @abstractmethod
    def is_configured(self) -> bool: ...

    @abstractmethod
    def prepare(self, *, text: str, values: dict, bindings: list[dict],
                catalogue: list[dict], pronunciations: list[dict],
                preferences: dict) -> PreparedSpeech: ...

    @abstractmethod
    def synthesize(self, prepared: PreparedSpeech,
                   on_progress=None) -> SynthesizedSpeech: ...


class BaseSFXProvider(ABC):
    @abstractmethod
    def generate_sfx(self, prompt: str, duration: float) -> AudioResult: ...
