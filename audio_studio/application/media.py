"""Resolve playable local media without exposing arbitrary filesystem paths."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from audio_studio.config import settings
from audio_studio.infrastructure.media_paths import media_root
from audio_studio.infrastructure.postgres.exports import ProductionExportRepository
from audio_studio.infrastructure.postgres.media import MediaLookupRepository


export_repository = ProductionExportRepository()
media_repository = MediaLookupRepository()


@dataclass(frozen=True, slots=True)
class MediaFile:
    path: Path
    download_name: str | None = None


def _contained_file(root: Path, *parts: str) -> Path | None:
    root = root.expanduser().resolve()
    # URL-controlled segments must be plain names. This blocks traversal and
    # deliberately prevents the public media surface from becoming a file API.
    if not parts or any(not part or Path(part).name != part for part in parts):
        return None
    candidate = root.joinpath(*parts).resolve()
    if root not in candidate.parents or not candidate.is_file():
        return None
    return candidate


def resolve(kind: str, name: str, folder: str | None = None) -> MediaFile | None:
    roots = {
        "audio": media_root(),
        "icon": settings.root / ".icons",
        "inbox": settings.root / ".inbox",
        "block-audio": settings.root / ".blocks",
        "samples": settings.voice_samples,
    }
    if kind == "batch-audio":
        if folder is None:
            return None
        path = _contained_file(media_root(), folder, name)
        return MediaFile(path, f"{folder}.zip" if path and path.suffix == ".zip" else None) if path else None
    root = roots.get(kind)
    path = _contained_file(root, name) if root else None
    return MediaFile(path) if path else None


def export_file(export_id: int) -> MediaFile | None:
    item = export_repository.get(export_id)
    if not item:
        return None
    path = _contained_file(media_root(), item["filename"])
    return MediaFile(path, item["filename"]) if path else None


def generation_file(generation_id: int) -> MediaFile | None:
    item = media_repository.generation(generation_id)
    if not item or not item.get("filename"):
        return None
    path = _contained_file(media_root(), item["filename"])
    return MediaFile(path, item["filename"]) if path else None
