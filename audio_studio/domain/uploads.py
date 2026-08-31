"""Provider-neutral identities for files accepted by Auvi Studio."""

from dataclasses import dataclass
from typing import Literal

from audio_studio.domain.media import AssetMediaType


AssetCategory = Literal[
    "music", "ambience", "sfx",
]
AssetScope = Literal["venture", "studio"]
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


@dataclass(frozen=True, slots=True)
class StoredAsset:
    filename: str
    path: str
    duration_ms: int | None
    audio_format: str | None
    mime_type: str
    sample_rate: int | None = None
    channels: int | None = None
    metadata: dict | None = None
    media_type: AssetMediaType = "audio"
    media_format: str | None = None
    width: int | None = None
    height: int | None = None
    video_codec: str | None = None
    frame_rate: float | None = None
