"""Search external audio, then Keep it through canonical Asset ingestion."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Protocol

from audio_studio.application.uploads import UploadService
from audio_studio.domain.audio_catalog import CatalogSound
from audio_studio.domain.uploads import AssetCategory, AssetScope


class AudioCatalog(Protocol):
    def status(self) -> dict[str, bool]: ...
    def search(self, query: str, *, license_filter: str = "all",
               duration_min: float | None = None,
               duration_max: float | None = None) -> list[CatalogSound]: ...
    def sound(self, external_id: str) -> CatalogSound: ...
    def download(self, sound: CatalogSound, target: Path): ...


class AudioCatalogService:
    def __init__(self, *, catalog: AudioCatalog, uploads: UploadService,
                 scratch_root: Path):
        self.catalog = catalog
        self.uploads = uploads
        self.scratch_root = scratch_root

    @staticmethod
    def _result(sound: CatalogSound) -> dict:
        return {
            **asdict(sound),
            "attribution_required": sound.attribution_required,
            "attribution_text": sound.attribution_text,
        }

    def status(self) -> dict[str, bool]:
        return self.catalog.status()

    def search(self, query: str, *, license_filter: str = "all",
               duration_min: float | None = None,
               duration_max: float | None = None) -> list[dict]:
        clean_query = " ".join(query.split())
        if len(clean_query) < 2:
            raise ValueError("Type at least two characters to search Freesound.")
        return [self._result(item) for item in self.catalog.search(
            clean_query, license_filter=license_filter,
            duration_min=duration_min, duration_max=duration_max)]

    def keep(self, *, collection_id: int, external_id: str, name: str,
             category: AssetCategory, scope: AssetScope,
             tags: tuple[str, ...]) -> dict:
        existing = self.uploads.catalog_asset(
            collection_id, origin="freesound", external_id=external_id,
            scope=scope)
        if existing:
            return {"asset": existing, "duplicate": True}

        sound = self.catalog.sound(external_id)
        self.scratch_root.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(
                prefix="freesound-", dir=self.scratch_root) as directory:
            target = Path(directory) / "source.download"
            downloaded = self.catalog.download(sound, target)
            provenance = {
                "origin": "freesound",
                "provider": "freesound",
                "external_id": sound.external_id,
                "creator": sound.creator,
                "source_url": sound.source_url,
                "license": sound.license,
                "license_url": sound.license_url,
                "attribution_required": sound.attribution_required,
                "attribution_text": sound.attribution_text,
                "original_freesound_name": sound.name,
                "source_tags": list(sound.tags),
            }
            details = self.uploads.prepare_asset_upload(
                downloaded.original_name, name=name or sound.name,
                category=category, scope=scope,
                encoded_tags=None, supplied_tags=tags or sound.tags,
                metadata=provenance)
            result = self.uploads.save_catalog_asset_file(
                collection_id, Path(downloaded.path), downloaded.size_bytes,
                origin="freesound", external_id=sound.external_id,
                details=details)
        return result
