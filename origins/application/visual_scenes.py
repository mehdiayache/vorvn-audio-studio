"""Visual Scene use cases over one canonical Production."""

from __future__ import annotations

from typing import Any, Protocol

from origins.domain.visual_scene import VisualSceneError


class VisualSceneRecords(Protocol):
    def get(self, production_id: int) -> dict[str, Any] | None: ...
    def commit(
        self, production_id: int, expected_revision: int,
        document: dict[str, Any],
    ) -> dict[str, Any] | None: ...


class VisualSceneService:
    def __init__(self, records: VisualSceneRecords):
        self.records = records

    def get(self, production_id: int) -> dict[str, Any]:
        scene = self.records.get(production_id)
        if not scene:
            raise VisualSceneError("That Production does not exist.")
        return scene

    def update(
        self, production_id: int, expected_revision: int,
        document: dict[str, Any],
    ) -> dict[str, Any]:
        saved = self.records.commit(
            production_id, expected_revision, document)
        if not saved:
            raise VisualSceneError("That Production does not exist.")
        return saved
