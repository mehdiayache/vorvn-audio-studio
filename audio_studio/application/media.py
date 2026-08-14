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
    def clip(self, recording_id: int) -> dict | None: ...


class MediaService:
    def __init__(self, workspace: MediaWorkspace, records: MediaRecords):
        self.workspace = workspace
        self.records = records

    def resolve(
        self, kind: str, name: str, folder: str | None = None,
    ) -> MediaFile | None:
        return self.workspace.resolve(kind, name, folder)

    def export_file(self, export_id: int) -> MediaFile | None:
        item = self.records.export(export_id)
        if not item or not item.get("filename"):
            return None
        filename = str(item["filename"])
        return self.workspace.resolve(
            "audio", filename, download_name=filename)

    def recording_file(self, recording_id: int) -> MediaFile | None:
        item = self.records.clip(recording_id)
        if not item or not item.get("filename"):
            return None
        filename = str(item["filename"])
        return self.workspace.resolve(
            "audio", filename, download_name=filename)
