"""Migration and integrity checks for durable cloned-voice masters."""

from __future__ import annotations

from typing import Protocol


class ReferenceRepository(Protocol):
    def references(self) -> list[dict]: ...
    def update_reference_paths(self, reference_id: str, *, original_path: str,
                               normalized_path: str) -> bool: ...


class ReferenceWorkspace(Protocol):
    def migrate_legacy(self, reference_id: str, stored_name: str,
                       role: str) -> str: ...
    def resolve(self, stored_name: str): ...


def migrate_legacy_references(repository: ReferenceRepository,
                              workspace: ReferenceWorkspace) -> int:
    """Copy legacy masters first, verify, then update their persisted paths."""
    migrated = 0
    for item in repository.references():
        reference_id = str(item["id"])
        original = workspace.migrate_legacy(
            reference_id, str(item.get("original_path") or ""), "original")
        normalized = workspace.migrate_legacy(
            reference_id, str(item.get("normalized_path") or ""), "normalized")
        if original:
            workspace.resolve(original)
        if normalized:
            workspace.resolve(normalized)
        if (original, normalized) != (
                item.get("original_path") or "",
                item.get("normalized_path") or ""):
            if not repository.update_reference_paths(
                    reference_id, original_path=original,
                    normalized_path=normalized):
                raise RuntimeError(
                    f"Voice reference {reference_id} disappeared during migration.")
            migrated += 1
    return migrated
