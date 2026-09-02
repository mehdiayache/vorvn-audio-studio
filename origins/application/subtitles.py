"""Saved subtitle catalogue independent from HTTP, PostgreSQL and local paths."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from origins.domain import captions


class SubtitleRecords(Protocol):
    def list(self, workspace_id: int, limit: int = 40) -> list[dict]: ...
    def get(self, transcript_id: int) -> dict | None: ...
    def delete(self, transcript_id: int) -> bool: ...


class SubtitleMedia(Protocol):
    def resolve(
        self, kind: str, name: str, folder: str | None = None,
    ) -> object | None: ...


class SubtitleCatalogueService:
    def __init__(self, records: SubtitleRecords, media: SubtitleMedia):
        self.records = records
        self.media = media

    def list(self, workspace_id: int, limit: int = 40) -> list[dict]:
        return self.records.list(
            workspace_id, limit=max(1, min(limit, 200)))

    def get(self, transcript_id: int) -> dict | None:
        item = self.records.get(transcript_id)
        if not item:
            return None
        audio_url = item.get("audio_url")
        if isinstance(audio_url, str) and audio_url.startswith("/audio/"):
            filename = Path(audio_url.removeprefix("/audio/")).name
            if not self.media.resolve("audio", filename):
                audio_url = None
        return {
            "id": item["id"],
            "public_id": item.get("public_id"),
            "file": item.get("name") or "subtitles",
            "url": audio_url,
            "text": item.get("text") or "",
            "srt": item.get("srt") or "",
            "vtt": item.get("vtt") or "",
            "sentences": item.get("sentences") or [],
            "duration_ms": item.get("duration_ms") or 0,
            "language": item.get("language"),
            "created_at": item.get("created_at"),
            "cost": float(item.get("catalog_cost") or 0),
            "cost_basis": item.get("cost_basis") or "unknown",
            "timing_source": item.get("timing_source"),
            "model": item.get("model"),
            "provider_region": item.get("provider_region"),
            "price_version": item.get("price_version"),
            "catalog_rate": float(item.get("catalog_rate") or 0),
            "source_job_id": item.get("source_job_public_id"),
            "workspace_id": item.get("workspace_id"),
        }

    def layout(self, transcript_id: int, profile: str) -> dict | None:
        item = self.records.get(transcript_id)
        if not item:
            return None
        return captions.layout(item.get("sentences") or [], profile)

    def delete(self, transcript_id: int) -> bool:
        return self.records.delete(transcript_id)
