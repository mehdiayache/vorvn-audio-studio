"""PostgreSQL records written by upload use cases."""

from __future__ import annotations

import psycopg

from audio_studio.domain.uploads import AssetCategory, StoredAsset
from audio_studio.infrastructure.postgres.venture_assets import VentureAssetRepository
from audio_studio.infrastructure.postgres.voice_packages import VoicePackageRepository


class PostgresUploadRecords:
    def __init__(
        self, *, voices: VoicePackageRepository | None = None,
        assets: VentureAssetRepository | None = None,
    ):
        self.voices = voices or VoicePackageRepository()
        self.assets = assets or VentureAssetRepository()

    def create_voice_reference(
        self, *, reference_id: str, original_name: str,
        original_path: str, normalized_path: str, sha256: str = "",
        duration_ms: int | None = None, sample_rate: int | None = None,
        channels: int | None = None,
        source_language: str = "", transcript: str = "",
        metadata: dict | None = None,
        storage_backend: str = "filesystem", storage_bucket: str | None = None,
        storage_key: str | None = None,
        original_storage_key: str | None = None,
        normalized_storage_key: str | None = None,
        original_sha256: str = "", normalized_sha256: str = "",
        original_size_bytes: int | None = None,
        normalized_size_bytes: int | None = None,
    ) -> str:
        return self.voices.create_reference(
            reference_id=reference_id, original_name=original_name,
            original_path=original_path, normalized_path=normalized_path,
            sha256=sha256, duration_ms=duration_ms,
            sample_rate=sample_rate, channels=channels,
            source_language=source_language, transcript=transcript,
            metadata=metadata or {}, storage_backend=storage_backend,
            storage_bucket=storage_bucket, storage_key=storage_key,
            original_storage_key=original_storage_key,
            normalized_storage_key=normalized_storage_key,
            original_sha256=original_sha256,
            normalized_sha256=normalized_sha256,
            original_size_bytes=original_size_bytes,
            normalized_size_bytes=normalized_size_bytes)

    def asset_collection(self, collection_id: int) -> dict | None:
        return self.assets.collection(collection_id)

    def create_uploaded_asset(
        self, collection_id: int, *, name: str, stored: StoredAsset,
        size_bytes: int, category: AssetCategory | None = None,
    ) -> dict | None:
        try:
            return self.assets.create_uploaded_asset(
                collection_id, name=name, filename=stored.filename,
                path=stored.path, size_bytes=size_bytes,
                duration_ms=stored.duration_ms,
                audio_format=stored.audio_format, mime_type=stored.mime_type,
                category=category)
        except psycopg.OperationalError as exc:
            raise RuntimeError(
                "The database could not save that Asset.") from exc
