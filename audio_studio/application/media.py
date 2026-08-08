"""Resolve playable local media without exposing arbitrary filesystem paths."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import db

from audio_studio.application.preferences import load_preferences
from audio_studio.config import settings


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
        "audio": Path(load_preferences()["out_dir"]),
        "icon": settings.root / ".icons",
        "inbox": settings.root / ".inbox",
        "block-audio": settings.root / ".blocks",
        "samples": settings.voice_samples,
    }
    if kind == "batch-audio":
        if folder is None:
            return None
        path = _contained_file(Path(load_preferences()["out_dir"]), folder, name)
        return MediaFile(path, f"{folder}.zip" if path and path.suffix == ".zip" else None) if path else None
    root = roots.get(kind)
    path = _contained_file(root, name) if root else None
    return MediaFile(path) if path else None


def export_file(export_id: int) -> MediaFile | None:
    item = db.export_get(export_id)
    if not item:
        return None
    path = _contained_file(Path(load_preferences()["out_dir"]), item["filename"])
    return MediaFile(path, item["filename"]) if path else None


def generation_file(generation_id: int) -> MediaFile | None:
    item = db.get(generation_id)
    if not item or not item.get("filename"):
        return None
    path = _contained_file(Path(load_preferences()["out_dir"]), item["filename"])
    return MediaFile(path, item["filename"]) if path else None
