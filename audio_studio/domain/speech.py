"""Provider-neutral speech values shared by application services and adapters."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class PreparedSpeech:
    original_text: str
    spoken_text: str
    voice: str
    voice_identity_id: str | None
    engine: str
    tier: str
    model_id: str
    output_format: str
    extension: str
    language: str | None
    instruction: str | None
    speech_mode: str
    rate: float
    pitch: float
    volume: int
    seed: int
    request_count: int
    estimated_cost: float
    voice_route: dict
    binding_id: str | None = None
    catalogue_voice_id: str | None = None
    reference_id: str | None = None
    capability_id: str | None = None
    capability_name: str | None = None
    provider: str | None = None
    provider_region: str | None = None
    pronunciations: list = field(default_factory=list)
    rewrites: list = field(default_factory=list)
    context: object = field(repr=False, compare=False, default=None)


@dataclass(frozen=True, slots=True)
class SynthesizedSpeech:
    audio: bytes
    cost: float
    cost_basis: str
    usage: dict[str, int | float]
    failures: list[dict]
    returned_text: str | None = None
    fidelity: dict = field(default_factory=dict)
    provider_region: str | None = None
    provider_endpoint: str | None = None
    price_version: str | None = None
    catalog_rate: str | None = None
    request_ids: list[str] = field(default_factory=list)
    diagnostics: list[dict] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class StoredAudio:
    """Provider-neutral identity of one durably stored recording."""

    filename: str
    path: str
    size_bytes: int
    duration_ms: int | None


class SpeechSynthesisError(RuntimeError):
    """Provider failure with usage and request evidence from completed calls."""

    def __init__(self, message: str, result: dict | None = None):
        super().__init__(message)
        self.result = result or {}
