"""Safe filesystem owner for immutable generated recordings."""

from __future__ import annotations

from pathlib import Path
import shutil
import subprocess
from uuid import uuid4

from audio_studio.domain.speech import StoredAudio
from audio_studio.infrastructure.audio_codec import normalize_audio
from audio_studio.infrastructure.media_paths import media_root


class AudioWorkspace:
    def __init__(self, root: Path | None = None):
        self._root = root

    @property
    def root(self) -> Path:
        value = self._root or media_root()
        return value.expanduser().resolve()

    def save(self, audio: bytes, extension: str) -> StoredAudio:
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
        normalized = normalize_audio(audio, output_format=safe_extension)
        temporary.write_bytes(normalized)
        temporary.replace(target)
        return StoredAudio(
            filename, str(target), len(normalized), self.duration_ms(target))

    def discard(self, filename: str) -> None:
        if not filename:
            return
        root = self.root
        target = (root / Path(filename).name).resolve()
        if target.parent == root:
            target.unlink(missing_ok=True)

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
