"""Provider-neutral media objects exposed by Origins."""

from dataclasses import dataclass
from pathlib import Path
from typing import Literal


FileMediaType = Literal["audio", "image", "video"]
FILE_MEDIA_TYPES = frozenset({"audio", "image", "video"})


@dataclass(frozen=True, slots=True)
class MediaFile:
    path: Path
    download_name: str | None = None


@dataclass(frozen=True, slots=True)
class MediaInspection:
    """Technical truth read from one immutable source file."""

    media_type: FileMediaType
    media_format: str
    extension: str
    mime_type: str
    duration_ms: int | None = None
    width: int | None = None
    height: int | None = None
    audio_format: str | None = None
    sample_rate: int | None = None
    channels: int | None = None
    video_codec: str | None = None
    frame_rate: float | None = None
    metadata: dict | None = None
