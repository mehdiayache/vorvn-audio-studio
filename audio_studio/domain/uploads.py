"""Provider-neutral identities for files accepted by Audio Studio."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class StoredVoiceReference:
    name: str
    original_path: str
    normalized_path: str


@dataclass(frozen=True, slots=True)
class StoredAsset:
    filename: str
    path: str
    duration_ms: int
    audio_format: str
    mime_type: str
