"""Visual Scene use cases over one canonical Project."""

from __future__ import annotations

from typing import Any, Protocol

from origins.domain.visual_scene import VisualSceneError


class VisualSceneRecords(Protocol):
    def get(self, project_id: int) -> dict[str, Any] | None: ...
    def commit(
        self, project_id: int, expected_revision: int,
        document: dict[str, Any],
    ) -> dict[str, Any] | None: ...


class VisualSceneService:
    def __init__(self, records: VisualSceneRecords):
        self.records = records

    def get(self, project_id: int) -> dict[str, Any]:
        scene = self.records.get(project_id)
        if not scene:
            raise VisualSceneError("That Project does not exist.")
        return scene

    def update(
        self, project_id: int, expected_revision: int,
        document: dict[str, Any],
    ) -> dict[str, Any]:
        saved = self.records.commit(
            project_id, expected_revision, document)
        if not saved:
            raise VisualSceneError("That Project does not exist.")
        return saved
