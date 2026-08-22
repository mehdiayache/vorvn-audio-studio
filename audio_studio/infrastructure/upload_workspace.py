"""Filesystem, FFmpeg and S3 implementation for upload workspaces."""

from __future__ import annotations

import mimetypes
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from uuid import uuid4

from audio_studio.config import settings
from audio_studio.domain.uploads import StoredAsset, StoredVoiceReference
from audio_studio.infrastructure import object_storage
from audio_studio.infrastructure.media_paths import media_root, voice_reference_root


_AUDIO_MIME_TYPES = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "ogg": "audio/ogg",
    "flac": "audio/flac",
    "m4a": "audio/mp4",
    "aac": "audio/aac",
    "aiff": "audio/aiff",
}


def _canonical_audio_format(container: str) -> str | None:
    containers = {item.strip().lower() for item in container.split(",")}
    for audio_format in ("wav", "mp3", "flac", "ogg", "aac", "aiff"):
        if audio_format in containers:
            return audio_format
    if containers.intersection({"mov", "mp4", "m4a", "3gp", "3g2", "mj2"}):
        return "m4a"
    return None


def _audio_duration_ms(target: Path) -> int | None:
    inspection = _inspect_audio(target)
    return inspection["duration_ms"] if inspection else None


def _inspect_audio(target: Path) -> dict | None:
    """Inspect one audio file once and return its canonical technical facts."""
    if not shutil.which("ffprobe"):
        return None
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration,format_name:stream=codec_type,codec_name,sample_rate,channels",
        "-of", "json", str(target),
    ], capture_output=True, text=True)
    if result.returncode:
        return None
    try:
        payload = json.loads(result.stdout)
        stream = next(
            item for item in payload.get("streams", [])
            if item.get("codec_type") == "audio")
        container = str(payload["format"]["format_name"])
        audio_format = _canonical_audio_format(container)
        duration_ms = int(float(payload["format"]["duration"]) * 1000)
        sample_rate = int(stream["sample_rate"])
        channels = int(stream["channels"])
    except (KeyError, StopIteration, TypeError, ValueError, json.JSONDecodeError):
        return None
    if (not audio_format or duration_ms <= 0 or sample_rate <= 0 or
            channels <= 0):
        return None
    return {
        "audio_format": audio_format,
        "duration_ms": duration_ms,
        "sample_rate": sample_rate,
        "channels": channels,
        "metadata": {
            "codec": stream.get("codec_name") or "",
            "container": container,
        },
    }


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
        backend = "filesystem"
        bucket = None
        storage_key = str(normalized.relative_to(self.references))
        original_key = str(original.relative_to(self.references))
        normalized_key = storage_key
        original_digest = hashlib.sha256(original.read_bytes()).hexdigest()
        normalized_digest = hashlib.sha256(normalized.read_bytes()).hexdigest()
        if self.objects.configured():
            original_locator = self.objects.put(
                original,
                content_type=(mimetypes.guess_type(original.name)[0]
                              or "application/octet-stream"),
                kind="voice-references", object_id=reference_id,
                retention="durable", variant="original")
            normalized_locator = self.objects.put(
                normalized, content_type="audio/wav",
                kind="voice-references", object_id=reference_id,
                retention="durable", variant="normalized")
            backend = "s3"
            bucket = normalized_locator["bucket"]
            original_key = original_locator["key"]
            normalized_key = normalized_locator["key"]
            storage_key = normalized_key
            original_digest = original_locator["sha256"]
            normalized_digest = normalized_locator["sha256"]
        return StoredVoiceReference(
            name=normalized.name,
            original_path=str(original.relative_to(self.references)),
            normalized_path=str(normalized.relative_to(self.references)),
            storage_backend=backend,
            storage_bucket=bucket,
            storage_key=storage_key,
            original_storage_key=original_key,
            normalized_storage_key=normalized_key,
            original_sha256=original_digest,
            normalized_sha256=normalized_digest,
            original_size_bytes=original.stat().st_size,
            normalized_size_bytes=normalized.stat().st_size,
            sha256=normalized_digest,
            duration_ms=_audio_duration_ms(normalized),
            sample_rate=24000 if normalized != original else None,
            channels=1 if normalized != original else None,
        )

    def discard_voice_reference(self, reference_id: str) -> None:
        shutil.rmtree(self._reference_directory(reference_id), ignore_errors=True)

    def store_asset(
        self, source: Path, *, original_name: str, size_bytes: int,
    ) -> StoredAsset:
        self.output.mkdir(parents=True, exist_ok=True)
        object_id = uuid4().hex
        staging = self.output / f"{object_id}.upload"
        target: Path | None = None
        try:
            shutil.move(str(source), staging)
            inspection = _inspect_audio(staging)
            if inspection is None:
                raise ValueError("That file could not be decoded as audio.")
            audio_format = inspection["audio_format"]
            target = self.output / f"{object_id}.{audio_format}"
            staging.replace(target)
        except Exception:
            staging.unlink(missing_ok=True)
            if target is not None:
                target.unlink(missing_ok=True)
            raise
        return StoredAsset(
            filename=target.name, path=str(target),
            duration_ms=inspection["duration_ms"],
            audio_format=audio_format,
            mime_type=_AUDIO_MIME_TYPES[audio_format],
            sample_rate=inspection["sample_rate"],
            channels=inspection["channels"],
            metadata=inspection["metadata"],
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
