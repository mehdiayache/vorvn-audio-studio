"""Bounded local uploads that never contact a model provider."""

from __future__ import annotations

from pathlib import Path
import mimetypes
import shutil
import subprocess
from urllib.parse import unquote
from uuid import uuid4

import db
import storage

from audio_studio.config import settings


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
    root = settings.root / ".uploads"
    root.mkdir(exist_ok=True)
    original = root / f"{uuid4().hex[:12]}-{original_name}"
    original.write_bytes(raw)
    normalized = original
    if shutil.which("ffmpeg"):
        normalized = original.with_name(f"{original.stem}-24k.wav")
        result = subprocess.run(
            ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(original),
             "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(normalized)],
            capture_output=True,
        )
        if result.returncode or not normalized.is_file():
            original.unlink(missing_ok=True)
            normalized.unlink(missing_ok=True)
            raise UploadError("That recording could not be decoded as audio.")
    reference_id = db.voice_reference_create(
        original_name=original_name, original_path=original.name,
        normalized_path=normalized.name,
    )
    if not reference_id:
        original.unlink(missing_ok=True)
        if normalized != original:
            normalized.unlink(missing_ok=True)
        raise UploadError("The reference recording could not be saved.")
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
    if not db.is_asset_folder(collection_id):
        raise UploadError("Choose an Intros, Outros, Music or Stingers library first.")
    if not raw:
        raise UploadError("That audio file is empty.")
    if len(raw) > 250_000_000:
        raise UploadError("That file is over 250 MB.")
    original = clean_name(encoded_name, "audio.mp3")
    suffix = Path(original).suffix.lower()
    if suffix not in {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}:
        raise UploadError("Use MP3, WAV, M4A, AAC, OGG or FLAC audio.")

    settings.output_dir.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid4().hex}{suffix}"
    target = settings.output_dir / stored
    target.write_bytes(raw)
    duration_ms = _audio_duration_ms(target)
    if duration_ms is None:
        target.unlink(missing_ok=True)
        raise UploadError("That file could not be decoded as audio.")

    generation_id = db.record({
        "text": Path(original).stem, "title": Path(original).stem,
        "voice": "Uploaded", "engine": "upload", "model": "-",
        "format": suffix.lstrip("."), "language": None, "instruction": "",
        "rate": 1, "pitch": 1, "volume": 50, "seed": 0,
        "filename": stored, "path": str(target), "size_bytes": len(raw),
        "chars": 0, "requests": 0, "cost": 0, "project_id": collection_id,
        "position": db.next_position(collection_id), "kind": "asset",
        "duration_ms": duration_ms, "speech_mode": "uploaded",
        "usage": {}, "cost_basis": "not billed", "failures": [],
    })
    if not generation_id:
        target.unlink(missing_ok=True)
        raise RuntimeError("The database could not save that asset.")
    asset_id = db.asset_register_generation(generation_id)
    if not asset_id:
        db.delete(generation_id)
        target.unlink(missing_ok=True)
        raise RuntimeError("The database could not register that Asset.")
    return {
        "id": asset_id, "generation_id": generation_id, "name": original,
        "filename": stored, "duration_ms": duration_ms,
        "url": f"/audio/{stored}",
    }


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
        url = storage.upload(str(local), content_type=content_type, kind="transcribe")
    except Exception:
        local.unlink(missing_ok=True)
        raise
    return {
        "url": url, "name": local.name, "playable": f"/inbox/{local.name}",
        "size_bytes": len(raw), "duration_ms": duration_ms,
    }
