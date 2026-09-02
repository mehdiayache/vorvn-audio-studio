"""Use cases for reusable Composer references."""

from __future__ import annotations

from typing import Protocol

from origins.domain.saved_references import SavedReferenceDraft


class SavedReferenceRecords(Protocol):
    def list(self, workspace_id: int) -> list[dict]: ...
    def create(self, workspace_id: int, draft: SavedReferenceDraft) -> dict | None: ...
    def delete(self, workspace_id: int, reference_id: str) -> bool | None: ...


class SavedReferenceService:
    def __init__(self, records: SavedReferenceRecords):
        self.records = records

    def list(self, workspace_id: int) -> list[dict]:
        return self.records.list(workspace_id)

    def create(
        self, workspace_id: int, *, name: str, reference_type: str,
        file_ids: list[int],
    ) -> dict | None:
        return self.records.create(
            workspace_id,
            SavedReferenceDraft.create(name, reference_type, file_ids),
        )

    def delete(self, workspace_id: int, reference_id: str) -> bool | None:
        return self.records.delete(workspace_id, reference_id)
