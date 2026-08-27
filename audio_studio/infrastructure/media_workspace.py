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

    def _video_derivative(self, name: str, *, kind: str) -> MediaFile | None:
        source = contained_file(self.output, name)
        if source is None:
            return None
        if not shutil.which("ffmpeg"):
            raise RuntimeError("FFmpeg is required to prepare that video preview.")
        stat = source.stat()
        digest = hashlib.sha256(
            f"{source.name}:{stat.st_size}:{stat.st_mtime_ns}:{kind}:v1".encode()
        ).hexdigest()[:24]
        extension = "jpg" if kind == "poster" else "mp4"
        target = self.output / f"video-{kind}-{digest}.{extension}"
        if target.is_file() and target.stat().st_size > 0:
            return MediaFile(target)
        temporary = target.with_name(
            f".{target.stem}-{uuid4().hex}.tmp.{extension}")
        if kind == "poster":
            command = [
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-ss", "0.100", "-i", str(source), "-frames:v", "1",
                "-vf", "scale=w='min(960,iw)':h=-2", "-q:v", "3",
                str(temporary),
            ]
        else:
            command = [
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-i", str(source), "-map", "0:v:0", "-an",
                "-vf", "scale=w='min(1920,iw)':h=-2",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                str(temporary),
            ]
        try:
            result = subprocess.run(
                command, capture_output=True, text=True, timeout=300)
        except (OSError, subprocess.TimeoutExpired) as exc:
            temporary.unlink(missing_ok=True)
            raise RuntimeError(f"Video preview preparation failed: {exc}") from exc
        if (result.returncode or not temporary.is_file()
                or temporary.stat().st_size <= 0):
            temporary.unlink(missing_ok=True)
            detail = (result.stderr or "FFmpeg produced no video").strip()
            raise RuntimeError(
                f"Video preview preparation failed: {detail[-240:]}")
        os.replace(temporary, target)
        for old in sorted(
            self.output.glob(f"video-{kind}-*.{extension}"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )[128:]:
            old.unlink(missing_ok=True)
        return MediaFile(target)

    def video_poster(self, name: str) -> MediaFile | None:
        return self._video_derivative(name, kind="poster")

    def video_proxy(self, name: str) -> MediaFile | None:
        return self._video_derivative(name, kind="proxy")

    def audio_proxy(self, name: str) -> MediaFile | None:
        """Return one browser-streamable audio derivative for any media source."""
        source = contained_file(self.output, name)
        if source is None:
            return None
        if not shutil.which("ffmpeg"):
            raise RuntimeError("FFmpeg is required to prepare that audio preview.")
        stat = source.stat()
        digest = hashlib.sha256(
            f"{source.name}:{stat.st_size}:{stat.st_mtime_ns}:audio:v1".encode()
        ).hexdigest()[:24]
        target = self.output / f"media-audio-{digest}.mp3"
        if target.is_file() and target.stat().st_size > 0:
            return MediaFile(target)
        temporary = target.with_name(f".{target.stem}-{uuid4().hex}.tmp.mp3")
        command = [
            "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
            "-i", str(source), "-map", "0:a:0", "-vn",
            "-ar", "48000", "-ac", "2", "-c:a", "libmp3lame",
            "-b:a", "192k", str(temporary),
        ]
        try:
            result = subprocess.run(
                command, capture_output=True, text=True, timeout=300)
        except (OSError, subprocess.TimeoutExpired) as exc:
            temporary.unlink(missing_ok=True)
            raise RuntimeError(f"Audio preview preparation failed: {exc}") from exc
        if (result.returncode or not temporary.is_file()
                or temporary.stat().st_size <= 0):
            temporary.unlink(missing_ok=True)
            detail = (result.stderr or "FFmpeg found no audio stream").strip()
            raise RuntimeError(
                f"Audio preview preparation failed: {detail[-240:]}")
        os.replace(temporary, target)
        for old in sorted(
            self.output.glob("media-audio-*.mp3"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )[128:]:
            old.unlink(missing_ok=True)
        return MediaFile(target)
