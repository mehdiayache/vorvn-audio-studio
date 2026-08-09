"""Upload use cases independent from filesystems, PostgreSQL and S3."""

from __future__ import annotations

from pathlib import Path
import hashlib
from typing import Protocol
from urllib.parse import unquote
from uuid import uuid4

from audio_studio.domain.uploads import StoredAsset, StoredVoiceReference


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
VOICE_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}


class UploadError(ValueError):
    def __init__(self, message: str, *, needs_storage: bool = False):
        super().__init__(message)
        self.needs_storage = needs_storage


class UploadWorkspace(Protocol):
    def store_image(self, raw: bytes, original_name: str) -> str: ...
    def store_voice_reference(
        self, raw: bytes, original_name: str, reference_id: str,
    ) -> StoredVoiceReference: ...
    def discard_voice_reference(self, reference_id: str) -> None: ...
    def store_asset(
        self, source: Path, *, original_name: str, size_bytes: int,
    ) -> StoredAsset: ...
    def discard_media(self, filename: str) -> None: ...
    def reference_storage_ready(self) -> bool: ...
    def store_transcription_source(
        self, source: Path, *, original_name: str, size_bytes: int,
        upload_id: str,
    ) -> dict: ...


class UploadRecords(Protocol):
    def create_voice_reference(
        self, *, reference_id: str, original_name: str,
        original_path: str, normalized_path: str,
        sha256: str = "", duration_ms: int | None = None,
        sample_rate: int | None = None, channels: int | None = None,
    ) -> str: ...
    def asset_collection(self, collection_id: int) -> dict | None: ...
    def create_uploaded_asset(
        self, collection_id: int, *, name: str, stored: StoredAsset,
        size_bytes: int,
    ) -> dict | None: ...


def clean_name(encoded: str, fallback: str) -> str:
    return Path(unquote(encoded or fallback)).name or fallback


class UploadService:
    def __init__(self, workspace: UploadWorkspace, records: UploadRecords):
        self.workspace = workspace
        self.records = records

    def save_image(self, raw: bytes, encoded_name: str) -> dict[str, str]:
        if not raw:
            raise UploadError("Choose an image first.")
        if len(raw) > 8_000_000:
            raise UploadError("That image is over 8 MB.")
        original = clean_name(encoded_name, "image.png")
        if Path(original).suffix.lower() not in IMAGE_EXTENSIONS:
            raise UploadError("Use a PNG, JPG, WEBP or GIF image.")
        try:
            return {"url": self.workspace.store_image(raw, original)}
        except ValueError as exc:
            raise UploadError(str(exc)) from exc

    def save_voice_reference(
        self, raw: bytes, encoded_name: str,
    ) -> dict[str, str]:
        if not raw:
            raise UploadError("Choose a recording first.")
        if len(raw) > 10_000_000:
            raise UploadError("That recording is over 10 MB.")
        original = clean_name(encoded_name, "reference.wav")
        if Path(original).suffix.lower() not in VOICE_EXTENSIONS:
            raise UploadError(
                "Use an MP3, WAV, M4A, AAC, OGG, FLAC or WebM recording.")
        reference_id = f"ref_{uuid4().hex}"
        try:
            stored = self.workspace.store_voice_reference(
                raw, original, reference_id)
        except ValueError as exc:
            raise UploadError(str(exc)) from exc
        try:
            saved_id = self.records.create_voice_reference(
                reference_id=reference_id,
                original_name=original,
                original_path=stored.original_path,
                normalized_path=stored.normalized_path,
                sha256=stored.sha256 or hashlib.sha256(raw).hexdigest(),
                duration_ms=stored.duration_ms,
                sample_rate=stored.sample_rate,
                channels=stored.channels,
            )
        except Exception:
            self.workspace.discard_voice_reference(reference_id)
            raise
        return {"name": stored.name, "reference_id": saved_id}

    def save_asset_file(
        self, collection_id: int, source: Path, size_bytes: int,
        encoded_name: str,
    ) -> dict:
        if not self.records.asset_collection(collection_id):
            raise UploadError(
                "Choose an Intros, Outros, Music or Stingers library first.")
        if size_bytes <= 0 or not source.is_file():
            raise UploadError("That audio file is empty.")
        if size_bytes > 250_000_000:
            raise UploadError("That file is over 250 MB.")
        original = clean_name(encoded_name, "audio.mp3")
        if Path(original).suffix.lower() not in AUDIO_EXTENSIONS:
            raise UploadError("Use MP3, WAV, M4A, AAC, OGG or FLAC audio.")
        try:
            stored = self.workspace.store_asset(
                source, original_name=original, size_bytes=size_bytes)
        except ValueError as exc:
            raise UploadError(str(exc)) from exc
        try:
            created = self.records.create_uploaded_asset(
                collection_id, name=Path(original).stem, stored=stored,
                size_bytes=size_bytes)
        except Exception:
            self.workspace.discard_media(stored.filename)
            raise
        if not created:
            self.workspace.discard_media(stored.filename)
            raise RuntimeError("That Asset collection no longer exists.")
        return {**created, "name": original,
                "url": f"/audio/{stored.filename}"}

    def save_transcription_source_file(
        self, source: Path, size_bytes: int, encoded_name: str,
    ) -> dict:
        if not self.workspace.reference_storage_ready():
            raise UploadError(
                "Set up Settings → Reference audio storage first.",
                needs_storage=True,
            )
        if size_bytes <= 0 or not source.is_file():
            raise UploadError("That audio file is empty.")
        if size_bytes > 500_000_000:
            raise UploadError("That file is over 500 MB.")
        original = clean_name(encoded_name, "audio.mp3")
        if Path(original).suffix.lower() not in AUDIO_EXTENSIONS:
            raise UploadError("Use MP3, WAV, M4A, AAC, OGG or FLAC audio.")
        try:
            return self.workspace.store_transcription_source(
                source, original_name=original, size_bytes=size_bytes,
                upload_id=f"upload_{uuid4().hex}")
        except ValueError as exc:
            raise UploadError(str(exc)) from exc
