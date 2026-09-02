"""Media lookup use cases independent from PostgreSQL and local paths."""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Protocol

from origins.domain.media import MediaFile


class MediaWorkspace(Protocol):
    def resolve(
        self, kind: str, name: str, folder: str | None = None,
        *, download_name: str | None = None,
    ) -> MediaFile | None: ...
    def segment(
        self, name: str, *, offset_ms: int, duration_ms: int,
    ) -> MediaFile | None: ...
    def video_poster(self, name: str) -> MediaFile | None: ...
    def video_proxy(self, name: str) -> MediaFile | None: ...
    def audio_proxy(self, name: str) -> MediaFile | None: ...


class MediaRecords(Protocol):
    def export(self, export_id: int) -> dict | None: ...
    def clip(self, recording_id: int) -> dict | None: ...


class VoiceReferenceRecords(Protocol):
    def reference(self, reference_id: str) -> dict | None: ...


class VoiceReferenceWorkspace(Protocol):
    def resolve_reference(self, reference: dict) -> Path: ...


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

    def audio_segment(
        self, name: str, *, offset_ms: int, duration_ms: int,
    ) -> MediaFile | None:
        return self.workspace.segment(
            name, offset_ms=offset_ms, duration_ms=duration_ms)

    def video_poster(self, name: str) -> MediaFile | None:
        return self.workspace.video_poster(name)

    def video_proxy(self, name: str) -> MediaFile | None:
        return self.workspace.video_proxy(name)

    def audio_proxy(self, name: str) -> MediaFile | None:
        return self.workspace.audio_proxy(name)


class VoiceReferenceMediaService:
    """Deliver one preserved Voice Source without exposing storage to HTTP."""

    def __init__(
        self,
        records: VoiceReferenceRecords,
        workspace: VoiceReferenceWorkspace,
        peak_reader: Callable[[Path, int], list[float]],
    ):
        self.records = records
        self.workspace = workspace
        self.peak_reader = peak_reader

    def source(self, reference_id: str) -> MediaFile | None:
        reference = self.records.reference(reference_id)
        if not reference:
            return None
        return MediaFile(
            self.workspace.resolve_reference(reference),
            str(reference.get("original_name") or "voice-source.wav"),
        )

    def peaks(self, reference_id: str, bars: int) -> list[float]:
        source = self.source(reference_id)
        if source is None:
            raise LookupError("Voice Source not found")
        return self.peak_reader(source.path, bars)
