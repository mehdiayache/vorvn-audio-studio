"""Sound Scene use cases over canonical Production Sequence truth."""

from __future__ import annotations

from typing import Any, Protocol

from audio_studio.domain.sound_scene import (
    SoundSceneError,
    SoundSceneRevisionConflict,
    resolve_scene,
)


class SoundSceneRecords(Protocol):
    def get(self, production_id: int) -> dict[str, Any] | None: ...
    def commit(
        self, production_id: int, expected_revision: int,
        document: dict[str, Any],
    ) -> dict[str, Any] | None: ...
    def step(
        self, production_id: int, direction: int,
    ) -> dict[str, Any] | None: ...


class SequenceRecords(Protocol):
    def parts(self, production_id: int) -> list[dict[str, Any]]: ...


class VoiceStemWorkspace(Protocol):
    def voice_stem(
        self, production_id: int, parts: list[dict[str, Any]],
        signature: str,
    ) -> dict[str, Any]: ...


class SoundSceneService:
    def __init__(
        self, records: SoundSceneRecords, sequence: SequenceRecords,
        workspace: VoiceStemWorkspace,
    ):
        self.records = records
        self.sequence = sequence
        self.workspace = workspace

    def _response(self, production_id: int) -> dict[str, Any]:
        scene = self.records.get(production_id)
        if not scene:
            raise SoundSceneError("That Production does not exist.")
        parts = self.sequence.parts(production_id)
        resolved = resolve_scene(
            scene.get("hydrated_document", scene["document"]), parts)
        projection = resolved["voice_projection"]
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
            "unavailable_reason": "Voice Projection contains unavailable audio.",
        } if unavailable else self.workspace.voice_stem(
            production_id, renderable, projection["signature"]))
        return {
            key: value for key, value in {
                **scene, "resolved": resolved, "voice_stem": stem,
            }.items() if key != "hydrated_document"
        }

    def get(self, production_id: int) -> dict[str, Any]:
        return self._response(production_id)

    def update(
        self, production_id: int, expected_revision: int,
        document: dict[str, Any],
    ) -> dict[str, Any]:
        try:
            saved = self.records.commit(
                production_id, expected_revision, document)
        except (ValueError, SoundSceneRevisionConflict):
            raise
        if not saved:
            raise SoundSceneError("That Production does not exist.")
        return self._response(production_id)

    def undo(self, production_id: int) -> dict[str, Any]:
        if not self.records.step(production_id, -1):
            raise SoundSceneError("That Production does not exist.")
        return self._response(production_id)

    def redo(self, production_id: int) -> dict[str, Any]:
        if not self.records.step(production_id, 1):
            raise SoundSceneError("That Production does not exist.")
        return self._response(production_id)
