"""Recoverable Composer preparation state, separate from Parts and Jobs."""

from __future__ import annotations

from typing import Any, Protocol

from audio_studio.domain.composer import ComposerDraftConflict

__all__ = ["ComposerDraftConflict", "ComposerDraftService", "context_key"]


class ComposerDraftStore(Protocol):
    def get(self, context: dict[str, Any],
            context_key: str) -> dict[str, Any] | None: ...
    def put(self, context: dict[str, Any], context_key: str,
            state: dict[str, Any], expected_version: int | None) -> dict[str, Any]: ...
    def delete(self, context_key: str, expected_version: int | None) -> bool: ...


def context_key(context: dict[str, Any]) -> str:
    """Build one deterministic owner key from an already validated context."""
    if context["kind"] == "standalone":
        return "standalone"
    production_id = int(context["production_id"])
    operation = str(context["operation"])
    if operation == "new_part":
        anchor = context.get("insert_before_part_id") or "end"
        return f"production:{production_id}:new_part:before:{anchor}"
    return f"production:{production_id}:{operation}:part:{int(context['part_id'])}"


class ComposerDraftService:
    def __init__(self, store: ComposerDraftStore):
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
