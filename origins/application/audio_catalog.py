"""Search external audio, then Keep it through canonical File ingestion."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Protocol

from origins.application.uploads import UploadService
from origins.domain.audio_catalog import CatalogSound
from origins.domain.uploads import FileCategory


class AudioCatalog(Protocol):
    def status(self) -> dict[str, object]: ...
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

    def status(self) -> dict[str, object]:
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

    def keep(self, *, workspace_id: int, external_id: str, name: str,
             category: FileCategory | None,
             tags: tuple[str, ...], folder_id: int | None = None) -> dict:
        existing = self.uploads.imported_file(
            workspace_id=workspace_id, provider_id="freesound",
            external_id=external_id)
        if existing:
            return {"file": existing, "duplicate": True}

        return self._keep(
            workspace_id=workspace_id,
            external_id=external_id, name=name, category=category,
            tags=tags, folder_id=folder_id)

    def _keep(
        self, *, workspace_id: int,
        external_id: str, name: str, category: FileCategory | None,
        tags: tuple[str, ...], folder_id: int | None = None,
    ) -> dict:
        sound = self.catalog.sound(external_id)
        self.scratch_root.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(
                prefix="freesound-", dir=self.scratch_root) as directory:
            target = Path(directory) / "source.download"
            downloaded = self.catalog.download(sound, target)
            provenance = {
                "origin": "imported",
                "provider_id": "freesound",
                "external_id": sound.external_id,
                "creator": sound.creator,
                "source_url": sound.source_url,
                "license": sound.license,
                "license_url": sound.license_url,
                "attribution_required": sound.attribution_required,
                "attribution_text": sound.attribution_text,
                "original_freesound_name": sound.name,
                "source_tags": list(sound.tags),
                "provider_category": sound.provider_category,
                "provider_subcategory": sound.provider_subcategory,
                "provider_category_is_user_provided": (
                    sound.provider_category_is_user_provided),
            }
            details = self.uploads.prepare_file_upload(
                downloaded.original_name, name=name or sound.name,
                category=category,
                encoded_tags=None, supplied_tags=tags,
                metadata=provenance)
            result = self.uploads.save_imported_workspace_file(
                workspace_id, Path(downloaded.path), downloaded.size_bytes,
                provider_id="freesound", external_id=sound.external_id,
                details=details, folder_id=folder_id)
        return result
