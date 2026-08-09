"""Bounded local uploads that never contact a model provider."""

from __future__ import annotations

from pathlib import Path
import mimetypes
import shutil
import subprocess
from urllib.parse import unquote
from uuid import uuid4

import psycopg
import storage

from audio_studio.config import settings
from audio_studio.infrastructure.media_paths import (
    media_root,
    voice_reference_directory,
)
from audio_studio.infrastructure.postgres.voice_packages import VoicePackageRepository
from audio_studio.infrastructure.postgres.venture_assets import (
    VentureAssetRepository,
)


voice_packages = VoicePackageRepository()
venture_assets = VentureAssetRepository()


class UploadError(ValueError):
    def __init__(self, message: str, *, needs_storage: bool = False):
        super().__init__(message)
        self.needs_storage = needs_storage


def clean_name(encoded: str, fallback: str) -> str:
    return Path(unquote(encoded or fallback)).name or fallback


def save_image(raw: bytes, encoded_name: str) -> dict[str, str]:
    if not raw:
        raise UploadError("Choose an image first.")
    if len(raw) > 8_000_000:
        raise UploadError("That image is over 8 MB.")
    original = clean_name(encoded_name, "image.png")
    suffix = Path(original).suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        raise UploadError("Use a PNG, JPG, WEBP or GIF image.")
    root = settings.root / ".icons"
    root.mkdir(exist_ok=True)
    stored = f"{Path(original).stem[:60] or 'image'}-{uuid4().hex[:12]}{suffix}"
    (root / stored).write_bytes(raw)
    return {"url": f"/icon/{stored}"}


def save_voice_reference(raw: bytes, encoded_name: str) -> dict[str, str]:
    if not raw:
        raise UploadError("Choose a recording first.")
    if len(raw) > 10_000_000:
        raise UploadError("That recording is over 10 MB.")
    original_name = clean_name(encoded_name, "reference.wav")
    if Path(original_name).suffix.lower() not in {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm"}:
        raise UploadError("Use an MP3, WAV, M4A, AAC, OGG, FLAC or WebM recording.")
    reference_id = f"ref_{uuid4().hex}"
    root = voice_reference_directory(reference_id)
    root.mkdir(parents=True, exist_ok=False)
    suffix = Path(original_name).suffix.lower()
    original = root / f"original{suffix}"
    original.write_bytes(raw)
    normalized = original
    if shutil.which("ffmpeg"):
        normalized = original.with_name("normalized-24k.wav")
        result = subprocess.run(
            ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(original),
             "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(normalized)],
            capture_output=True,
        )
        if result.returncode or not normalized.is_file():
            original.unlink(missing_ok=True)
            normalized.unlink(missing_ok=True)
            raise UploadError("That recording could not be decoded as audio.")
    try:
        reference_id = voice_packages.create_reference(
            original_name=original_name,
            original_path=str(original.relative_to(voice_reference_directory(reference_id).parent)),
            normalized_path=str(normalized.relative_to(voice_reference_directory(reference_id).parent)),
            reference_id=reference_id,
        )
    except Exception:
        shutil.rmtree(root, ignore_errors=True)
        raise
    return {"name": normalized.name, "reference_id": reference_id}


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


def save_asset(collection_id: int, raw: bytes, encoded_name: str) -> dict:
    """Store one reusable Venture Asset without contacting a model provider."""
    if not venture_assets.collection(collection_id):
        raise UploadError("Choose an Intros, Outros, Music or Stingers library first.")
    if not raw:
        raise UploadError("That audio file is empty.")
    if len(raw) > 250_000_000:
        raise UploadError("That file is over 250 MB.")
    original = clean_name(encoded_name, "audio.mp3")
    suffix = Path(original).suffix.lower()
    if suffix not in {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}:
        raise UploadError("Use MP3, WAV, M4A, AAC, OGG or FLAC audio.")

    output = media_root()
    output.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid4().hex}{suffix}"
    target = output / stored
    target.write_bytes(raw)
    duration_ms = _audio_duration_ms(target)
    if duration_ms is None:
        target.unlink(missing_ok=True)
        raise UploadError("That file could not be decoded as audio.")

    mime_type = {
        ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
        ".flac": "audio/flac", ".m4a": "audio/mp4", ".aac": "audio/aac",
    }.get(suffix, "application/octet-stream")
    try:
        created = venture_assets.create_uploaded_asset(
            collection_id, name=Path(original).stem, filename=stored,
            path=str(target), size_bytes=len(raw), duration_ms=duration_ms,
            audio_format=suffix.lstrip("."), mime_type=mime_type,
        )
    except psycopg.OperationalError as exc:
        target.unlink(missing_ok=True)
        raise RuntimeError("The database could not save that Asset.") from exc
    if not created:
        target.unlink(missing_ok=True)
        raise RuntimeError("That Asset collection no longer exists.")
    return {**created, "name": original, "url": f"/audio/{stored}"}


def save_transcription_source(raw: bytes, encoded_name: str) -> dict:
    """Keep a playable local source and create the short-lived worker URL."""
    if not storage.configured():
        raise UploadError(
            "Set up Settings → Reference audio storage first.",
            needs_storage=True,
        )
    if not raw:
        raise UploadError("That audio file is empty.")
    if len(raw) > 500_000_000:
        raise UploadError("That file is over 500 MB.")
    original = clean_name(encoded_name, "audio.mp3")
    suffix = Path(original).suffix.lower()
    if suffix not in {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}:
        raise UploadError("Use MP3, WAV, M4A, AAC, OGG or FLAC audio.")
    root = settings.root / ".inbox"
    root.mkdir(exist_ok=True)
    local = root / f"{uuid4().hex}{suffix}"
    local.write_bytes(raw)
    duration_ms = _audio_duration_ms(local)
    if duration_ms is None:
        local.unlink(missing_ok=True)
        raise UploadError("That file could not be decoded as audio.")
    content_type = mimetypes.guess_type(local.name)[0] or "application/octet-stream"
    try:
        url = storage.upload(
            str(local), content_type=content_type, kind="transcription-sources",
            object_id=f"upload_{local.stem}", retention="temporary")
    except Exception:
        local.unlink(missing_ok=True)
        raise
    return {
        "url": url, "name": local.name, "playable": f"/inbox/{local.name}",
        "size_bytes": len(raw), "duration_ms": duration_ms,
    }
