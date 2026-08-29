"""Use cases for reusable Director references."""

from __future__ import annotations

from typing import Protocol

from audio_studio.domain.saved_references import SavedReferenceDraft


class SavedReferenceRecords(Protocol):
    def list(self, venture_id: int) -> list[dict]: ...
    def create(self, venture_id: int, draft: SavedReferenceDraft) -> dict | None: ...
    def delete(self, venture_id: int, reference_id: str) -> bool | None: ...


class SavedReferenceService:
    def __init__(self, records: SavedReferenceRecords):
        self.records = records

    def list(self, venture_id: int) -> list[dict]:
        return self.records.list(venture_id)

    def create(
        self, venture_id: int, *, name: str, reference_type: str,
        asset_ids: list[int],
    ) -> dict | None:
        return self.records.create(
            venture_id,
            SavedReferenceDraft.create(name, reference_type, asset_ids),
        )

    def delete(self, venture_id: int, reference_id: str) -> bool | None:
        return self.records.delete(venture_id, reference_id)
