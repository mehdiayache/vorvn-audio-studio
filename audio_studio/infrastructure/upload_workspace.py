"""Filesystem, FFmpeg and S3 implementation for upload workspaces."""

from __future__ import annotations

import mimetypes
from pathlib import Path
import shutil
import subprocess
from uuid import uuid4

from audio_studio.config import settings
from audio_studio.domain.uploads import StoredAsset, StoredVoiceReference
from audio_studio.infrastructure import object_storage
from audio_studio.infrastructure.media_paths import media_root, voice_reference_root


def _audio_duration_ms(target: Path) -> int | None:
    if not shutil.which("ffprobe"):
        return None
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(target)],
        capture_output=True, text=True,
    )
    try:
        return int(float(result.stdout.strip()) * 1000)
    except (TypeError, ValueError):
        return None


class LocalUploadWorkspace:
    def __init__(
        self, *, root: Path | None = None, output: Path | None = None,
        references: Path | None = None, objects=object_storage,
    ):
        self.root = (root or settings.root).resolve()
        self._output = output.resolve() if output else None
        self._references = references.resolve() if references else None
        self.objects = objects

    @property
    def output(self) -> Path:
        return self._output or media_root()

    @property
    def references(self) -> Path:
        return self._references or voice_reference_root()

    def store_image(self, raw: bytes, original_name: str) -> str:
        suffix = Path(original_name).suffix.lower()
        directory = self.root / ".icons"
        directory.mkdir(exist_ok=True)
        stored = (
            f"{Path(original_name).stem[:60] or 'image'}-"
            f"{uuid4().hex[:12]}{suffix}"
        )
        (directory / stored).write_bytes(raw)
        return f"/icon/{stored}"

    def _reference_directory(self, reference_id: str) -> Path:
        target = (self.references / reference_id).resolve()
        if target.parent != self.references:
            raise ValueError("The voice reference path is invalid.")
        return target

    def store_voice_reference(
        self, raw: bytes, original_name: str, reference_id: str,
    ) -> StoredVoiceReference:
        directory = self._reference_directory(reference_id)
        directory.mkdir(parents=True, exist_ok=False)
        original = directory / f"original{Path(original_name).suffix.lower()}"
        original.write_bytes(raw)
        normalized = original
        if shutil.which("ffmpeg"):
            normalized = directory / "normalized-24k.wav"
            result = subprocess.run(
                ["ffmpeg", "-nostdin", "-loglevel", "error", "-y",
                 "-i", str(original), "-ac", "1", "-ar", "24000",
                 "-c:a", "pcm_s16le", str(normalized)],
                capture_output=True,
            )
            if result.returncode or not normalized.is_file():
                shutil.rmtree(directory, ignore_errors=True)
                raise ValueError("That recording could not be decoded as audio.")
        return StoredVoiceReference(
            name=normalized.name,
            original_path=str(original.relative_to(self.references)),
            normalized_path=str(normalized.relative_to(self.references)),
            duration_ms=_audio_duration_ms(normalized),
            sample_rate=24000 if normalized != original else None,
            channels=1 if normalized != original else None,
        )

    def discard_voice_reference(self, reference_id: str) -> None:
        shutil.rmtree(self._reference_directory(reference_id), ignore_errors=True)

    def store_asset(
        self, source: Path, *, original_name: str, size_bytes: int,
    ) -> StoredAsset:
        suffix = Path(original_name).suffix.lower()
        self.output.mkdir(parents=True, exist_ok=True)
        filename = f"{uuid4().hex}{suffix}"
        target = self.output / filename
        shutil.move(str(source), target)
        duration_ms = _audio_duration_ms(target)
        if duration_ms is None:
            target.unlink(missing_ok=True)
            raise ValueError("That file could not be decoded as audio.")
        mime_type = {
            ".mp3": "audio/mpeg", ".wav": "audio/wav",
            ".ogg": "audio/ogg", ".flac": "audio/flac",
            ".m4a": "audio/mp4", ".aac": "audio/aac",
        }.get(suffix, "application/octet-stream")
        return StoredAsset(
            filename=filename, path=str(target), duration_ms=duration_ms,
            audio_format=suffix.lstrip("."), mime_type=mime_type,
        )

    def discard_media(self, filename: str) -> None:
        name = Path(filename).name
        if name == filename:
            (self.output / name).unlink(missing_ok=True)

    def reference_storage_ready(self) -> bool:
        return self.objects.configured()

    def store_transcription_source(
        self, source: Path, *, original_name: str, size_bytes: int,
        upload_id: str,
    ) -> dict:
        suffix = Path(original_name).suffix.lower()
        inbox = self.root / ".inbox"
        inbox.mkdir(exist_ok=True)
        local = inbox / f"{upload_id}{suffix}"
        shutil.move(str(source), local)
        duration_ms = _audio_duration_ms(local)
        if duration_ms is None:
            local.unlink(missing_ok=True)
            raise ValueError("That file could not be decoded as audio.")
        content_type = (
            mimetypes.guess_type(local.name)[0] or "application/octet-stream")
        try:
            url = self.objects.upload(
                str(local), content_type=content_type,
                kind="transcription-sources", object_id=upload_id,
                retention="temporary")
        except Exception:
            local.unlink(missing_ok=True)
            raise
        return {
            "url": url, "name": local.name,
            "playable": f"/inbox/{local.name}",
            "size_bytes": size_bytes, "duration_ms": duration_ms,
        }
