"""Provider-neutral transcription values and model identities."""

from __future__ import annotations

from dataclasses import dataclass


QWEN_MODEL = "qwen3-asr-flash-filetrans"
FUN_MODEL = "fun-asr"


@dataclass(frozen=True, slots=True)
class PreparedAudio:
    url: str
    name: str
    playable: str | None
    duration_ms: int
    generation_id: int | None
    local_path: str | None = None


@dataclass(frozen=True, slots=True)
class ProviderTranscript:
    text: str
    sentences: list[dict]
    duration_ms: int
    request_id: str | None = None
    provider_region: str | None = None
    provider_endpoint: str | None = None
    billed_duration_ms: int | None = None
    usage: dict | None = None
