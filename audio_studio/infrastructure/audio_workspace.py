"""Safe filesystem owner for immutable generated recordings."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
import subprocess
from uuid import uuid4

from audio_studio.infrastructure.media_paths import media_root


@dataclass(frozen=True, slots=True)
class SavedAudio:
    filename: str
    path: str
    size_bytes: int
    duration_ms: int | None


class AudioWorkspace:
    def __init__(self, root: Path | None = None):
        self._root = root

    @property
    def root(self) -> Path:
        value = self._root or media_root()
        return value.expanduser().resolve()

    def save(self, audio: bytes, extension: str) -> SavedAudio:
        if not audio:
            raise ValueError("Alibaba returned no audio.")
        safe_extension = extension.casefold().lstrip(".")
        if safe_extension not in {"mp3", "wav", "ogg"}:
            raise ValueError("That output file type is not supported.")
        root = self.root
        root.mkdir(parents=True, exist_ok=True)
        filename = f"{uuid4().hex}.{safe_extension}"
        target = (root / filename).resolve()
        if target.parent != root:
            raise ValueError("The output path is invalid.")
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_bytes(audio)
        temporary.replace(target)
        return SavedAudio(filename, str(target), len(audio), self.duration_ms(target))

    @staticmethod
    def duration_ms(path: Path) -> int | None:
        if not path.is_file() or not shutil.which("ffprobe"):
            return None
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(path)],
            capture_output=True, text=True,
        )
        try:
            return max(0, round(float(result.stdout.strip()) * 1000))
        except (TypeError, ValueError):
            return None
