"""Contained local media lookup for browser delivery."""

from __future__ import annotations

from pathlib import Path

from audio_studio.config import settings
from audio_studio.domain.media import MediaFile
from audio_studio.infrastructure.media_paths import media_root


def contained_file(root: Path, *parts: str) -> Path | None:
    root = root.expanduser().resolve()
    if not parts or any(not part or Path(part).name != part for part in parts):
        return None
    candidate = root.joinpath(*parts).resolve()
    if root not in candidate.parents or not candidate.is_file():
        return None
    return candidate


class LocalMediaWorkspace:
    def __init__(
        self, *, root: Path | None = None, output: Path | None = None,
        voice_samples: Path | None = None,
    ):
        self.root = (root or settings.root).resolve()
        self._output = output.resolve() if output else None
        self.voice_samples = (
            voice_samples.resolve() if voice_samples else settings.voice_samples)

    @property
    def output(self) -> Path:
        return self._output or media_root()

    def resolve(
        self, kind: str, name: str, folder: str | None = None,
        *, download_name: str | None = None,
    ) -> MediaFile | None:
        if kind == "batch-audio":
            if folder is None:
                return None
            path = contained_file(self.output, folder, name)
        else:
            roots = {
                "audio": self.output,
                "icon": self.root / ".icons",
                "inbox": self.root / ".inbox",
                "block-audio": self.root / ".blocks",
                "samples": self.voice_samples,
            }
            root = roots.get(kind)
            path = contained_file(root, name) if root else None
        return MediaFile(path, download_name) if path else None
