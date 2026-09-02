"""Provider-neutral results produced by deterministic audio finishing."""

from dataclasses import dataclass
from pathlib import Path


class RenderError(RuntimeError):
    pass


def silence_duration_seconds(part: dict) -> float:
    """Return canonical Silence duration, with title compatibility for old rows."""
    duration_ms = part.get("duration_ms")
    if duration_ms is not None:
        seconds = float(duration_ms) / 1000
    else:
        seconds = float(part.get("title") or 1)
    return max(.1, min(120.0, seconds))


@dataclass(frozen=True, slots=True)
class FinishedExport:
    target: Path
    manifest_path: Path
    caption_paths: tuple[Path, ...]
    filename: str
    manifest: dict
    renderer: str
    duration_ms: int | None
    size_bytes: int
    part_count: int
    subtitles: dict
    mixed: bool
