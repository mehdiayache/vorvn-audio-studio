"""Durable File identity independent from storage paths and Project use."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Literal
from uuid import UUID


FileFamily = Literal[
    "audio", "image", "video", "subtitle", "document", "archive", "data",
    "other",
]
FILE_FAMILIES = frozenset({
    "audio", "image", "video", "subtitle", "document", "archive", "data",
    "other",
})


def file_family(mime_type: str) -> FileFamily:
    """Return a presentation family without constraining valid MIME types."""
    canonical = mime_type.strip().casefold()
    if canonical.startswith("audio/"):
        return "audio"
    if canonical.startswith("image/"):
        return "image"
    if canonical.startswith("video/"):
        return "video"
    if canonical in {
        "application/x-subrip", "text/vtt", "application/ttml+xml",
    }:
        return "subtitle"
    if canonical in {
        "application/zip", "application/x-tar", "application/gzip",
    }:
        return "archive"
    if canonical in {
        "application/json", "application/ld+json", "text/csv",
    }:
        return "data"
    if canonical.startswith("text/") or canonical == "application/pdf":
        return "document"
    return "other"


@dataclass(frozen=True, slots=True)
class StoredFileVersion:
    """Physical facts ready to become one immutable FileVersion."""

    filename: str
    path: str
    mime_type: str
    family: FileFamily
    duration_ms: int | None = None
    media_format: str | None = None
    audio_format: str | None = None
    sample_rate: int | None = None
    channels: int | None = None
    metadata: dict[str, Any] | None = None
    width: int | None = None
    height: int | None = None
    video_codec: str | None = None
    frame_rate: float | None = None

    def __post_init__(self) -> None:
        if not self.filename.strip() or not self.path.strip():
            raise ValueError("Stored File versions require storage identity.")
        if "/" not in self.mime_type or self.family not in FILE_FAMILIES:
            raise ValueError("Stored File versions require a valid MIME type and family.")
        if file_family(self.mime_type) != self.family:
            raise ValueError("Stored File family must agree with its MIME type.")


@dataclass(frozen=True, slots=True)
class FileVersion:
    id: int
    public_id: UUID
    file_id: int
    version: int
    storage_key: str
    filename: str
    mime_type: str
    size_bytes: int
    checksum: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None

    def __post_init__(self) -> None:
        if self.id < 1 or self.file_id < 1 or self.version < 1:
            raise ValueError("FileVersion identifiers and version must be positive.")
        if not self.storage_key.strip() or not self.filename.strip():
            raise ValueError("FileVersion requires storage identity and filename.")
        if "/" not in self.mime_type or self.size_bytes < 0:
            raise ValueError("FileVersion requires a MIME type and non-negative size.")

    @property
    def family(self) -> str:
        return file_family(self.mime_type)

    @property
    def suffix(self) -> str:
        return Path(self.filename).suffix.casefold()


@dataclass(frozen=True, slots=True)
class File:
    id: int
    public_id: UUID
    workspace_id: int
    name: str
    current_version_id: int | None = None
    folder_id: int | None = None
    source: str = "uploaded"
    tags: tuple[str, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        if self.id < 1 or self.workspace_id < 1:
            raise ValueError("File and Workspace identifiers must be positive.")
        if not self.name.strip():
            raise ValueError("File requires a name.")
        if self.current_version_id is not None and self.current_version_id < 1:
            raise ValueError("Current FileVersion ID must be positive.")
        if self.folder_id is not None and self.folder_id < 1:
            raise ValueError("Folder ID must be positive.")
