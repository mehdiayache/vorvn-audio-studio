"""Media lookup use cases independent from PostgreSQL and local paths."""

from __future__ import annotations

from typing import Protocol

from audio_studio.domain.media import MediaFile


class MediaWorkspace(Protocol):
    def resolve(
        self, kind: str, name: str, folder: str | None = None,
        *, download_name: str | None = None,
    ) -> MediaFile | None: ...


class MediaRecords(Protocol):
    def export(self, export_id: int) -> dict | None: ...
    def generation(self, generation_id: int) -> dict | None: ...


class MediaService:
    def __init__(self, workspace: MediaWorkspace, records: MediaRecords):
        self.workspace = workspace
        self.records = records

    def resolve(
        self, kind: str, name: str, folder: str | None = None,
    ) -> MediaFile | None:
        download_name = (
            f"{folder}.zip" if kind == "batch-audio" and folder
            and name.casefold().endswith(".zip") else None
        )
        return self.workspace.resolve(
            kind, name, folder, download_name=download_name)

    def export_file(self, export_id: int) -> MediaFile | None:
        item = self.records.export(export_id)
        if not item or not item.get("filename"):
            return None
        filename = str(item["filename"])
        return self.workspace.resolve(
            "audio", filename, download_name=filename)

    def generation_file(self, generation_id: int) -> MediaFile | None:
        item = self.records.generation(generation_id)
        if not item or not item.get("filename"):
            return None
        filename = str(item["filename"])
        return self.workspace.resolve(
            "audio", filename, download_name=filename)
