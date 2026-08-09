"""Provider-neutral results produced by deterministic audio finishing."""

from dataclasses import dataclass
from pathlib import Path


class RenderError(RuntimeError):
    pass


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
