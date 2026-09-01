"""Provider-neutral identities for files accepted by Auvi Studio."""

from dataclasses import dataclass
from typing import Literal

AssetCategory = Literal[
    "music", "ambience", "sfx",
]
AssetScope = Literal["space", "studio"]
ASSET_CATEGORIES = frozenset({
    "music", "ambience", "sfx",
})


@dataclass(frozen=True, slots=True)
class StoredVoiceReference:
    name: str
    original_path: str
    normalized_path: str
    storage_backend: str = "filesystem"
    storage_bucket: str | None = None
    storage_key: str | None = None
    original_storage_key: str | None = None
    normalized_storage_key: str | None = None
    original_sha256: str = ""
    normalized_sha256: str = ""
    original_size_bytes: int | None = None
    normalized_size_bytes: int | None = None
    sha256: str = ""
    duration_ms: int | None = None
    sample_rate: int | None = None
    channels: int | None = None
