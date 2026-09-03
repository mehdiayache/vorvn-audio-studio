"""Upload use cases independent from filesystems, PostgreSQL and S3."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import hashlib
from typing import cast, Protocol
from urllib.parse import unquote
from uuid import uuid4

from origins.domain.files import StoredFileVersion
from origins.domain.uploads import (
    FILE_CATEGORIES,
    FileCategory,
    StoredVoiceReference,
)


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
VOICE_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm"}
AUDIO_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".aif", ".aiff",
}
VISUAL_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
VISUAL_VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm"}
MEDIA_FILE_EXTENSIONS = (
    AUDIO_EXTENSIONS | VISUAL_IMAGE_EXTENSIONS | VISUAL_VIDEO_EXTENSIONS
)
FILE_EXTENSIONS = MEDIA_FILE_EXTENSIONS | {
    ".srt", ".vtt", ".txt", ".md", ".pdf", ".json", ".csv", ".zip",
}
MAX_FILE_NAME_LENGTH = 120
MAX_FILE_TAGS = 12
MAX_FILE_TAG_LENGTH = 32
MAX_FILE_UPLOAD_BYTES = 1_000_000_000
MAX_FILE_UPLOAD_BYTES = 1_000_000_000
MIN_VOICE_REFERENCE_DURATION_MS = 5_000
MAX_VOICE_REFERENCE_DURATION_MS = 600_000
MAX_VOICE_REFERENCE_SIZE_BYTES = 100_000_000


class UploadError(ValueError):
    def __init__(self, message: str, *, needs_storage: bool = False):
        super().__init__(message)
        self.needs_storage = needs_storage


@dataclass(frozen=True, slots=True)
class FileUploadDetails:
    original_name: str
    name: str
    category: FileCategory | None
    tags: tuple[str, ...]
    metadata: dict


class UploadWorkspace(Protocol):
    def store_image(self, raw: bytes, original_name: str) -> str: ...
    def store_voice_reference(
        self, raw: bytes, original_name: str, reference_id: str,
    ) -> StoredVoiceReference: ...
    def discard_voice_reference(self, reference_id: str) -> None: ...
    def store_file(
        self, source: Path, *, original_name: str, size_bytes: int,
    ) -> StoredFileVersion: ...
    def discard_media(self, filename: str) -> None: ...
    def object_storage_ready(self) -> bool: ...
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
        source_language: str = "", transcript: str = "",
        metadata: dict | None = None,
        storage_backend: str = "filesystem", storage_bucket: str | None = None,
        storage_key: str | None = None,
        original_storage_key: str | None = None,
        normalized_storage_key: str | None = None,
        original_sha256: str = "", normalized_sha256: str = "",
        original_size_bytes: int | None = None,
        normalized_size_bytes: int | None = None,
    ) -> str: ...
    def workspace(self, workspace_id: int) -> dict | None: ...
    def create_workspace_file(
        self, workspace_id: int, *, name: str, stored: StoredFileVersion,
        size_bytes: int, category: FileCategory | None = None,
        tags: tuple[str, ...] = (),
        metadata: dict | None = None, folder_id: int | None = None,
    ) -> dict | None: ...
    def create_imported_workspace_file(
        self, workspace_id: int, *, provider_id: str, external_id: str,
        name: str, stored: StoredFileVersion, size_bytes: int,
        category: FileCategory | None = None,
        tags: tuple[str, ...] = (),
        metadata: dict | None = None, folder_id: int | None = None,
    ) -> tuple[dict | None, bool]: ...
    def create_generated_workspace_file(
        self, workspace_id: int, *, candidate_id: str,
        name: str, stored: StoredFileVersion, size_bytes: int,
        category: FileCategory | None = None,
        tags: tuple[str, ...] = (),
        metadata: dict | None = None, folder_id: int | None = None,
    ) -> tuple[dict | None, bool]: ...
    def imported_file(
        self, *, workspace_id: int, provider_id: str, external_id: str,
    ) -> dict | None: ...
    def generated_workspace_file(
        self, *, workspace_id: int, candidate_id: str,
    ) -> dict | None: ...
    def update_file_details(
        self, file_id: int, *, name: str,
        category: FileCategory | None,
        tags: tuple[str, ...],
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
        self, raw: bytes, encoded_name: str, *, source_language: str = "",
        transcript: str = "", metadata: dict | None = None,
    ) -> dict[str, str | int]:
        if not raw:
            raise UploadError("Choose a recording first.")
        if len(raw) > MAX_VOICE_REFERENCE_SIZE_BYTES:
            raise UploadError("That source recording is over 100 MB.")
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
        duration_ms = stored.duration_ms
        if duration_ms is None:
            self.workspace.discard_voice_reference(reference_id)
            raise UploadError(
                "That recording could not be measured. Use a valid audio file.")
        if duration_ms < MIN_VOICE_REFERENCE_DURATION_MS:
            self.workspace.discard_voice_reference(reference_id)
            raise UploadError(
                "That recording is too short. Use at least 5 seconds of clear speech.")
        if duration_ms > MAX_VOICE_REFERENCE_DURATION_MS:
            self.workspace.discard_voice_reference(reference_id)
            raise UploadError(
                "That source recording is over 10 minutes. Choose a shorter master.")
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
                source_language=source_language.strip().lower(),
                transcript=transcript.strip(),
                metadata=metadata or {},
                storage_backend=stored.storage_backend,
                storage_bucket=stored.storage_bucket,
                storage_key=stored.storage_key or stored.normalized_path,
                original_storage_key=(stored.original_storage_key
                                      or stored.original_path),
                normalized_storage_key=(stored.normalized_storage_key
                                        or stored.normalized_path),
                original_sha256=stored.original_sha256,
                normalized_sha256=(stored.normalized_sha256 or stored.sha256),
                original_size_bytes=stored.original_size_bytes,
                normalized_size_bytes=stored.normalized_size_bytes,
            )
        except Exception:
            self.workspace.discard_voice_reference(reference_id)
            raise
        return {
            "name": stored.name,
            "reference_id": saved_id,
            "duration_ms": duration_ms,
            "sample_rate": stored.sample_rate or 0,
            "channels": stored.channels or 0,
        }

    def save_workspace_file(
        self, workspace_id: int, source: Path, size_bytes: int,
        encoded_name: str, *, name: str | None = None,
        category: str | None = None, encoded_tags: str | None = None,
        details: FileUploadDetails | None = None,
        folder_id: int | None = None,
    ) -> dict:
        prepared = details or self.prepare_file_upload(
            encoded_name, name=name, category=category,
            encoded_tags=encoded_tags)
        stored = self._store_workspace_file(workspace_id, source, size_bytes, prepared)
        try:
            created = self.records.create_workspace_file(
                workspace_id, name=prepared.name, stored=stored,
                size_bytes=size_bytes, category=prepared.category,
                tags=prepared.tags,
                metadata=prepared.metadata, folder_id=folder_id)
        except Exception:
            self.workspace.discard_media(stored.filename)
            raise
        if not created:
            self.workspace.discard_media(stored.filename)
            raise RuntimeError("That Workspace no longer exists.")
        return {**created, "url": self._file_url(stored)}

    def save_imported_workspace_file(
        self, workspace_id: int, source: Path, size_bytes: int, *,
        provider_id: str, external_id: str, details: FileUploadDetails,
        folder_id: int | None = None,
    ) -> dict:
        stored = self._store_workspace_file(workspace_id, source, size_bytes, details)
        try:
            file, duplicate = self.records.create_imported_workspace_file(
                workspace_id, provider_id=provider_id, external_id=external_id,
                name=details.name, stored=stored, size_bytes=size_bytes,
                category=details.category,
                tags=details.tags, metadata=details.metadata,
                folder_id=folder_id)
        except Exception:
            self.workspace.discard_media(stored.filename)
            raise
        if not file:
            self.workspace.discard_media(stored.filename)
            raise RuntimeError("That Workspace no longer exists.")
        if duplicate:
            self.workspace.discard_media(stored.filename)
        return {"file": file, "duplicate": duplicate}

    def save_generated_workspace_file(
        self, workspace_id: int, source: Path, size_bytes: int, *,
        candidate_id: str, details: FileUploadDetails,
        folder_id: int | None = None,
    ) -> dict:
        stored = self._store_workspace_file(workspace_id, source, size_bytes, details)
        try:
            file, duplicate = self.records.create_generated_workspace_file(
                workspace_id, candidate_id=candidate_id, name=details.name,
                stored=stored, size_bytes=size_bytes,
                category=details.category,
                tags=details.tags, metadata=details.metadata,
                folder_id=folder_id)
        except Exception:
            self.workspace.discard_media(stored.filename)
            raise
        if not file:
            self.workspace.discard_media(stored.filename)
            raise RuntimeError("That Workspace no longer exists.")
        if duplicate:
            self.workspace.discard_media(stored.filename)
        return {"file": file, "duplicate": duplicate}

    def _store_workspace_file(
        self, workspace_id: int, source: Path, size_bytes: int,
        details: FileUploadDetails,
    ) -> StoredFileVersion:
        if not self.records.workspace(workspace_id):
            raise UploadError("Choose a Workspace first.")
        return self._store_file(source, size_bytes, details)

    def _store_file(
        self, source: Path, size_bytes: int, details: FileUploadDetails,
    ) -> StoredFileVersion:
        if size_bytes <= 0 or not source.is_file():
            raise UploadError("That file is empty.")
        if size_bytes > MAX_FILE_UPLOAD_BYTES:
            raise UploadError("That file is over the 1 GB limit.")
        if Path(details.original_name).suffix.lower() not in FILE_EXTENSIONS:
            raise UploadError(
                "Use supported media, subtitles, text, PDF, JSON, CSV or ZIP.")
        try:
            stored = self.workspace.store_file(
                source, original_name=details.original_name,
                size_bytes=size_bytes)
        except ValueError as exc:
            raise UploadError(str(exc)) from exc
        if stored.family != "audio" and details.category is not None:
            self.workspace.discard_media(stored.filename)
            raise UploadError(
                "Music, ambience and Sound Effect categories apply only to audio.")
        return stored

    @staticmethod
    def _file_url(stored: StoredFileVersion) -> str:
        prefix = "audio" if stored.family == "audio" else "media"
        return f"/{prefix}/{stored.filename}"

    def prepare_file_upload(
        self, encoded_name: str, *, name: str | None = None,
        category: str | None = None, encoded_tags: str | None = None,
        supplied_tags: tuple[str, ...] | None = None,
        metadata: dict | None = None,
    ) -> FileUploadDetails:
        """Validate one direct Workspace File before reading its request body."""
        return self._prepare_file_details(
            encoded_name, name=name, category=category,
            encoded_tags=encoded_tags, supplied_tags=supplied_tags,
            metadata=metadata, allowed_extensions=FILE_EXTENSIONS,
            subject="File",
        )

    def _prepare_file_details(
        self, encoded_name: str, *, name: str | None, category: str | None,
        encoded_tags: str | None,
        supplied_tags: tuple[str, ...] | None, metadata: dict | None,
        allowed_extensions: set[str], subject: str,
    ) -> FileUploadDetails:
        original = clean_name(encoded_name, "audio.mp3")
        if Path(original).suffix.lower() not in allowed_extensions:
            raise UploadError(
                "Use supported media, subtitles, text, PDF, JSON, CSV or ZIP."
                if subject == "File" else
                "Use supported audio, JPG, PNG, WebP, MP4, MOV or WebM media.")
        canonical_name = " ".join(
            (unquote(name) if name is not None else Path(original).stem).split())
        if not canonical_name:
            raise UploadError(f"Give this {subject} a name.")
        if len(canonical_name) > MAX_FILE_NAME_LENGTH:
            raise UploadError(
                f"Keep the {subject} name under {MAX_FILE_NAME_LENGTH} characters.")

        canonical_category = category.strip().lower() if category else None
        if canonical_category and canonical_category not in FILE_CATEGORIES:
            raise UploadError("Choose a valid audio category.")
        raw_tags: object = list(supplied_tags or ())
        if encoded_tags is not None:
            try:
                raw_tags = json.loads(unquote(encoded_tags))
            except (TypeError, ValueError, json.JSONDecodeError) as exc:
                raise UploadError("Tags could not be read.") from exc
        if not isinstance(raw_tags, list) or not all(
                isinstance(item, str) for item in raw_tags):
            raise UploadError("Tags must be a list of words or short phrases.")
        tags: list[str] = []
        seen: set[str] = set()
        for raw_tag in raw_tags:
            tag = " ".join(raw_tag.split()).casefold()
            if not tag or tag in seen:
                continue
            if len(tag) > MAX_FILE_TAG_LENGTH:
                raise UploadError(
                    f"Keep each tag under {MAX_FILE_TAG_LENGTH} characters.")
            seen.add(tag)
            tags.append(tag)
        if len(tags) > MAX_FILE_TAGS:
            raise UploadError(f"Use at most {MAX_FILE_TAGS} tags.")

        provenance = {
            "origin": "uploaded", "original_filename": original,
            **(metadata or {}),
        }
        return FileUploadDetails(
            original_name=original,
            name=canonical_name,
            category=cast(FileCategory | None, canonical_category),
            tags=tuple(tags),
            metadata=provenance,
        )

    def update_file(
        self, file_id: int, *, name: str, category: str | None,
        tags: tuple[str, ...],
    ) -> dict:
        """Update human-owned File facts without changing its origin or file."""
        details = self.prepare_file_upload(
            "file.mp3", name=name, category=category,
            supplied_tags=tags, metadata={})
        updated = self.records.update_file_details(
            file_id, name=details.name, category=details.category,
            tags=details.tags)
        if not updated:
            raise UploadError("That File no longer exists.")
        return updated

    def imported_file(
        self, *, workspace_id: int, provider_id: str, external_id: str,
    ) -> dict | None:
        return self.records.imported_file(
            workspace_id=workspace_id, provider_id=provider_id,
            external_id=external_id)

    def generated_workspace_file(
        self, *, workspace_id: int, candidate_id: str,
    ) -> dict | None:
        return self.records.generated_workspace_file(
            workspace_id=workspace_id, candidate_id=candidate_id)

    def save_transcription_source_file(
        self, source: Path, size_bytes: int, encoded_name: str,
    ) -> dict:
        if not self.workspace.object_storage_ready():
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
