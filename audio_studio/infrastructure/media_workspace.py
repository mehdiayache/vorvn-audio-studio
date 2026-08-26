"""Contained local media lookup for browser delivery."""

from __future__ import annotations

from pathlib import Path
import hashlib
import os
import shutil
import subprocess
from uuid import uuid4

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
        roots = {
            "audio": self.output,
            "media": self.output,
            "icon": self.root / ".icons",
            "inbox": self.root / ".inbox",
            "block-audio": self.root / ".blocks",
            "samples": self.voice_samples,
        }
        root = roots.get(kind)
        path = contained_file(root, name) if root else None
        return MediaFile(path, download_name) if path else None

    def segment(
        self, name: str, *, offset_ms: int, duration_ms: int,
    ) -> MediaFile | None:
        """Return one exact, bounded PCM-decoding source for browser playout."""
        source = contained_file(self.output, name)
        if source is None:
            return None
        if not shutil.which("ffmpeg"):
            raise RuntimeError("FFmpeg is required to prepare that audio window.")
        stat = source.stat()
        identity = (
            f"{source.name}:{stat.st_size}:{stat.st_mtime_ns}:"
            f"{offset_ms}:{duration_ms}"
        )
        digest = hashlib.sha256(identity.encode()).hexdigest()[:24]
        target = self.output / f"segment-{digest}.mp3"
        if target.is_file() and target.stat().st_size > 0:
            return MediaFile(target)
        temporary = target.with_name(f".{target.stem}-{uuid4().hex}.tmp.mp3")
        command = [
            "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
            "-ss", f"{offset_ms / 1000:.3f}", "-i", str(source),
            "-t", f"{duration_ms / 1000:.3f}", "-vn",
            "-ar", "48000", "-ac", "2", "-c:a", "libmp3lame",
            "-b:a", "192k", str(temporary),
        ]
        try:
            result = subprocess.run(
                command, capture_output=True, text=True, timeout=120)
        except (OSError, subprocess.TimeoutExpired) as exc:
            temporary.unlink(missing_ok=True)
            raise RuntimeError(f"Audio window preparation failed: {exc}") from exc
        if (result.returncode or not temporary.is_file()
                or temporary.stat().st_size <= 0):
            temporary.unlink(missing_ok=True)
            detail = (result.stderr or "FFmpeg produced no audio").strip()
            raise RuntimeError(
                f"Audio window preparation failed: {detail[-240:]}")
        os.replace(temporary, target)
        for old in sorted(
            self.output.glob("segment-*.mp3"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )[128:]:
            old.unlink(missing_ok=True)
        return MediaFile(target)
