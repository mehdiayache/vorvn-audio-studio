"""Sound Scene use cases over canonical Project Sequence truth."""

from __future__ import annotations

from typing import Any, Protocol

from origins.domain.sound_scene import (
    SoundSceneError,
    SoundSceneRevisionConflict,
    resolve_scene,
)


class SoundSceneRecords(Protocol):
    def get(self, project_id: int) -> dict[str, Any] | None: ...
    def commit(
        self, project_id: int, expected_revision: int,
        document: dict[str, Any], mutation_kind: str = "operator",
    ) -> dict[str, Any] | None: ...
    def step(
        self, project_id: int, direction: int,
    ) -> dict[str, Any] | None: ...


class SequenceRecords(Protocol):
    def parts(self, project_id: int) -> list[dict[str, Any]]: ...


class SequenceStemWorkspace(Protocol):
    def sequence_stem(
        self, project_id: int, parts: list[dict[str, Any]],
        signature: str,
    ) -> dict[str, Any]: ...


class SoundSceneService:
    def __init__(
        self, records: SoundSceneRecords, sequence: SequenceRecords,
        workspace: SequenceStemWorkspace,
    ):
        self.records = records
        self.sequence = sequence
        self.workspace = workspace

    def _response(self, project_id: int) -> dict[str, Any]:
        scene = self.records.get(project_id)
        if not scene:
            raise SoundSceneError("That Project does not exist.")
        parts = self.sequence.parts(project_id)
        resolved = resolve_scene(
            scene.get("hydrated_document", scene["document"]), parts)
        projection = resolved["sequence_projection"]
        renderable_ids = {
            span["part_id"] for span in projection["spans"]
        }
        renderable = [
            part for part in parts if part.get("id") in renderable_ids
        ]
        unavailable = [
            span for span in projection["spans"]
            if not span["silence"]
            and (span["missing"] or not span["filename"])
        ]
        stem = ({
            "url": "", "filename": "", "duration_ms": 0,
            "signature": projection["signature"], "cached": False,
            "unavailable_reason": "Sequence contains unavailable audio.",
        } if unavailable else self.workspace.sequence_stem(
            project_id, renderable, projection["signature"]))
        return {
            key: value for key, value in {
                **scene, "resolved": resolved, "sequence_stem": stem,
            }.items() if key != "hydrated_document"
        }

    def get(self, project_id: int) -> dict[str, Any]:
        return self._response(project_id)

    def update(
        self, project_id: int, expected_revision: int,
        document: dict[str, Any], mutation_kind: str = "operator",
    ) -> dict[str, Any]:
        try:
            saved = self.records.commit(
                project_id, expected_revision, document, mutation_kind)
        except (ValueError, SoundSceneRevisionConflict):
            raise
        if not saved:
            raise SoundSceneError("That Project does not exist.")
        return self._response(project_id)

    def undo(self, project_id: int) -> dict[str, Any]:
        if not self.records.step(project_id, -1):
            raise SoundSceneError("That Project does not exist.")
        return self._response(project_id)

    def redo(self, project_id: int) -> dict[str, Any]:
        if not self.records.step(project_id, 1):
            raise SoundSceneError("That Project does not exist.")
        return self._response(project_id)
