"""Recoverable Creator preparation state, separate from Parts and Jobs."""

from __future__ import annotations

from typing import Any, Protocol

from origins.domain.creator import CreatorDraftConflict

__all__ = ["CreatorDraftConflict", "CreatorDraftService", "context_key"]


class CreatorDraftStore(Protocol):
    def get(self, context: dict[str, Any],
            context_key: str) -> dict[str, Any] | None: ...
    def put(self, context: dict[str, Any], context_key: str,
            state: dict[str, Any], expected_version: int | None) -> dict[str, Any]: ...
    def delete(self, context_key: str, expected_version: int | None) -> bool: ...


def context_key(context: dict[str, Any]) -> str:
    """Build one deterministic owner key from an already validated context."""
    if context["kind"] == "standalone":
        return "standalone"
    project_id = int(context["project_id"])
    part_id = context.get("part_id")
    if part_id is not None:
        return f"project:{project_id}:part:{int(part_id)}"
    anchor = context.get("insert_before_part_id") or "end"
    return f"project:{project_id}:new_part:before:{anchor}"


class CreatorDraftService:
    def __init__(self, store: CreatorDraftStore):
        self.store = store

    def get(self, context: dict[str, Any]) -> dict[str, Any] | None:
        return self.store.get(context, context_key(context))

    def put(self, context: dict[str, Any], state: dict[str, Any],
            expected_version: int | None = None) -> dict[str, Any]:
        return self.store.put(
            context, context_key(context), state, expected_version)

    def delete(self, context: dict[str, Any],
               expected_version: int | None = None) -> dict[str, bool]:
        return {"deleted": self.store.delete(
            context_key(context), expected_version)}
