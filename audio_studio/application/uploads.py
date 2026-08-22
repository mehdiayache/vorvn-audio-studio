"""Upload use cases independent from filesystems, PostgreSQL and S3."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import hashlib
from typing import cast, Protocol
from urllib.parse import unquote
from uuid import uuid4

from audio_studio.domain.uploads import (
    ASSET_CATEGORIES,
    AssetCategory,
    AssetScope,
    StoredAsset,
    StoredVoiceReference,
)


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
VOICE_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm"}
AUDIO_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".aif", ".aiff",
}
ASSET_SCOPES = frozenset({"venture", "studio"})
MAX_ASSET_NAME_LENGTH = 120
MAX_ASSET_TAGS = 12
MAX_ASSET_TAG_LENGTH = 32


class UploadError(ValueError):
    def __init__(self, message: str, *, needs_storage: bool = False):
        super().__init__(message)
        self.needs_storage = needs_storage


@dataclass(frozen=True, slots=True)
class AssetUploadDetails:
    original_name: str
    name: str
    category: AssetCategory | None
    scope: AssetScope
    tags: tuple[str, ...]
    metadata: dict


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
    def asset_collection(self, collection_id: int) -> dict | None: ...
    def create_uploaded_asset(
        self, collection_id: int, *, name: str, stored: StoredAsset,
        size_bytes: int, category: AssetCategory | None = None,
        scope: AssetScope = "venture", tags: tuple[str, ...] = (),
        metadata: dict | None = None,
    ) -> dict | None: ...
    def create_catalog_asset(
        self, collection_id: int, *, origin: str, external_id: str,
        name: str, stored: StoredAsset, size_bytes: int,
        category: AssetCategory | None = None,
        scope: AssetScope = "venture", tags: tuple[str, ...] = (),
        metadata: dict | None = None,
    ) -> tuple[dict | None, bool]: ...
    def catalog_asset(
        self, collection_id: int, *, origin: str, external_id: str,
        scope: AssetScope,
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
        return {"name": stored.name, "reference_id": saved_id}

    def save_asset_file(
        self, collection_id: int, source: Path, size_bytes: int,
        encoded_name: str, *, name: str | None = None,
        category: str | None = None, scope: str | None = None,
        encoded_tags: str | None = None,
        details: AssetUploadDetails | None = None,
    ) -> dict:
        prepared = details or self.prepare_asset_upload(
            encoded_name, name=name, category=category, scope=scope,
            encoded_tags=encoded_tags)
        stored = self._store_asset_file(
            collection_id, source, size_bytes, prepared)
        try:
            created = self.records.create_uploaded_asset(
                collection_id, name=prepared.name, stored=stored,
                size_bytes=size_bytes, category=prepared.category,
                scope=prepared.scope, tags=prepared.tags,
                metadata=prepared.metadata)
        except Exception:
            self.workspace.discard_media(stored.filename)
            raise
        if not created:
            self.workspace.discard_media(stored.filename)
            raise RuntimeError("That Asset collection no longer exists.")
        return {**created,
                "url": f"/audio/{stored.filename}"}

    def save_catalog_asset_file(
        self, collection_id: int, source: Path, size_bytes: int, *,
        origin: str, external_id: str, details: AssetUploadDetails,
    ) -> dict:
        """Store an external original, then resolve its canonical Asset once."""
        stored = self._store_asset_file(
            collection_id, source, size_bytes, details)
        try:
            asset, duplicate = self.records.create_catalog_asset(
                collection_id, origin=origin, external_id=external_id,
                name=details.name, stored=stored, size_bytes=size_bytes,
                category=details.category, scope=details.scope,
                tags=details.tags, metadata=details.metadata)
        except Exception:
            self.workspace.discard_media(stored.filename)
            raise
        if not asset:
            self.workspace.discard_media(stored.filename)
            raise RuntimeError("That Asset collection no longer exists.")
        if duplicate:
            self.workspace.discard_media(stored.filename)
        return {"asset": asset, "duplicate": duplicate}

    def _store_asset_file(
        self, collection_id: int, source: Path, size_bytes: int,
        details: AssetUploadDetails,
    ) -> StoredAsset:
        if not self.records.asset_collection(collection_id):
            raise UploadError(
                "Choose an Intros, Outros, Music or Stingers library first.")
        if size_bytes <= 0 or not source.is_file():
            raise UploadError("That audio file is empty.")
        if size_bytes > 250_000_000:
            raise UploadError("That file is over 250 MB.")
        if Path(details.original_name).suffix.lower() not in AUDIO_EXTENSIONS:
            raise UploadError(
                "Use MP3, WAV, M4A, AAC, OGG, FLAC or AIFF audio.")
        try:
            return self.workspace.store_asset(
                source, original_name=details.original_name,
                size_bytes=size_bytes)
        except ValueError as exc:
            raise UploadError(str(exc)) from exc

    def prepare_asset_upload(
        self, encoded_name: str, *, name: str | None = None,
        category: str | None = None, scope: str | None = None,
        encoded_tags: str | None = None,
        supplied_tags: tuple[str, ...] | None = None,
        metadata: dict | None = None,
    ) -> AssetUploadDetails:
        """Validate human Asset facts before streaming or storing media."""
        original = clean_name(encoded_name, "audio.mp3")
        if Path(original).suffix.lower() not in AUDIO_EXTENSIONS:
            raise UploadError(
                "Use MP3, WAV, M4A, AAC, OGG, FLAC or AIFF audio.")
        canonical_name = " ".join(
            (unquote(name) if name is not None else Path(original).stem).split())
        if not canonical_name:
            raise UploadError("Give this audio a name.")
        if len(canonical_name) > MAX_ASSET_NAME_LENGTH:
            raise UploadError(
                f"Keep the audio name under {MAX_ASSET_NAME_LENGTH} characters.")

        canonical_category = category.strip().lower() if category else None
        if canonical_category and canonical_category not in ASSET_CATEGORIES:
            raise UploadError("Choose a valid audio category.")
        canonical_scope = (scope or "venture").strip().lower()
        if canonical_scope not in ASSET_SCOPES:
            raise UploadError("Choose Studio Library or This Venture.")

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
            if len(tag) > MAX_ASSET_TAG_LENGTH:
                raise UploadError(
                    f"Keep each tag under {MAX_ASSET_TAG_LENGTH} characters.")
            seen.add(tag)
            tags.append(tag)
        if len(tags) > MAX_ASSET_TAGS:
            raise UploadError(f"Use at most {MAX_ASSET_TAGS} tags.")

        provenance = {
            "origin": "upload", "original_filename": original,
            **(metadata or {}),
        }
        return AssetUploadDetails(
            original_name=original,
            name=canonical_name,
            category=cast(AssetCategory | None, canonical_category),
            scope=cast(AssetScope, canonical_scope),
            tags=tuple(tags),
            metadata=provenance,
        )

    def catalog_asset(
        self, collection_id: int, *, origin: str, external_id: str,
        scope: AssetScope,
    ) -> dict | None:
        return self.records.catalog_asset(
            collection_id, origin=origin, external_id=external_id,
            scope=scope)

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
