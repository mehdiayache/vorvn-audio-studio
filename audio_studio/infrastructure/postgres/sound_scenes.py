"""PostgreSQL persistence for versioned Sound Scene documents."""

from __future__ import annotations

from copy import deepcopy
import json
from typing import Any

from audio_studio.domain.sound_scene import (
    SoundSceneRevisionConflict,
    empty_scene,
    normalize_scene,
)
from audio_studio.infrastructure.postgres.session import read_only, transaction


class SoundSceneRepository:
    @staticmethod
    def production_exists(production_id: int) -> bool:
        with read_only() as cursor:
            cursor.execute(
                "SELECT 1 FROM productions WHERE id=%s", (production_id,))
            return cursor.fetchone() is not None

    @staticmethod
    def _ensure(cursor, production_id: int) -> None:
        document = empty_scene()
        cursor.execute("""
            INSERT INTO sound_scenes (production_id, document)
            SELECT id, %s::jsonb FROM productions WHERE id=%s
            ON CONFLICT (production_id) DO NOTHING
        """, (json.dumps(document), production_id))
        cursor.execute("""
            INSERT INTO sound_scene_history (production_id, revision, document)
            SELECT production_id, revision, document FROM sound_scenes
             WHERE production_id=%s
            ON CONFLICT (production_id, revision) DO NOTHING
        """, (production_id,))

    @staticmethod
    def _history_state(cursor, production_id: int, revision: int) -> tuple[bool, bool]:
        cursor.execute("""
            SELECT EXISTS(
                       SELECT 1 FROM sound_scene_history
                        WHERE production_id=%s AND revision < %s),
                   EXISTS(
                       SELECT 1 FROM sound_scene_history
                        WHERE production_id=%s AND revision > %s)
        """, (production_id, revision, production_id, revision))
        row = cursor.fetchone() or (False, False)
        return bool(row[0]), bool(row[1])

    def get(self, production_id: int) -> dict[str, Any] | None:
        with transaction() as cursor:
            self._ensure(cursor, production_id)
            cursor.execute("""
                SELECT revision, document, updated_at
                  FROM sound_scenes WHERE production_id=%s
            """, (production_id,))
            row = cursor.fetchone()
            if not row:
                return None
            can_undo, can_redo = self._history_state(
                cursor, production_id, int(row[0]))
        document = normalize_scene(row[1])
        return {
            "production_id": production_id,
            "revision": int(row[0]),
            "document": document,
            "hydrated_document": self.hydrate(production_id, document),
            "can_undo": can_undo,
            "can_redo": can_redo,
            "updated_at": row[2].isoformat(),
        }

    def hydrate(
        self, production_id: int, document: dict[str, Any],
    ) -> dict[str, Any]:
        result = deepcopy(document)
        clips = [clip for track in result["tracks"] for clip in track["clips"]]
        asset_ids = sorted({int(clip["asset_id"]) for clip in clips})
        if not asset_ids:
            return result
        with read_only() as cursor:
            cursor.execute("""
                SELECT asset.id, asset.name, asset.kind,
                       version.id, version.filename, version.duration_ms
                  FROM assets asset
                  JOIN productions production ON production.id=%s
                  JOIN work_projects project ON project.id=production.project_id
                  LEFT JOIN asset_versions version ON version.asset_id=asset.id
                 WHERE asset.venture_id=project.venture_id
                   AND asset.id = ANY(%s::bigint[])
                 ORDER BY asset.id, version.version DESC
            """, (production_id, asset_ids))
            versions: dict[int, list[tuple]] = {}
            for row in cursor.fetchall():
                versions.setdefault(int(row[0]), []).append(row)
        for track in result["tracks"]:
            for clip in track["clips"]:
                candidates = versions.get(int(clip["asset_id"]), [])
                requested = clip.get("asset_version_id")
                source = next(
                    (row for row in candidates if row[3] == requested),
                    candidates[0] if candidates else None,
                )
                if not source:
                    clip.update({
                        "asset_name": "Unavailable asset", "filename": "",
                        "source_duration_ms": 0, "missing": True,
                    })
                    continue
                clip.update({
                    "asset_name": source[1] or "Untitled audio",
                    "asset_kind": source[2],
                    "asset_version_id": int(source[3]) if source[3] else None,
                    "filename": source[4] or "",
                    "source_duration_ms": int(source[5] or 0),
                    "missing": not bool(source[4]),
                })
        return result

    def validate_assets(
        self, production_id: int, document: dict[str, Any],
    ) -> dict[str, Any]:
        scene = normalize_scene(document)
        hydrated = self.hydrate(production_id, scene)
        for track in hydrated["tracks"]:
            for clip in track["clips"]:
                if clip.get("missing"):
                    raise ValueError("A Sound Scene Asset is unavailable.")
                if track["kind"] == "music" and clip.get("asset_kind") != "music":
                    raise ValueError(
                        "The Music track only accepts this Venture's Music assets.")
        return normalize_scene(hydrated)

    def commit(
        self, production_id: int, expected_revision: int,
        document: dict[str, Any],
    ) -> dict[str, Any] | None:
        canonical = self.validate_assets(production_id, document)
        with transaction() as cursor:
            self._ensure(cursor, production_id)
            cursor.execute("""
                SELECT revision FROM sound_scenes
                 WHERE production_id=%s FOR UPDATE
            """, (production_id,))
            row = cursor.fetchone()
            if not row:
                return None
            current = int(row[0])
            if current != int(expected_revision):
                raise SoundSceneRevisionConflict(current)
            next_revision = current + 1
            cursor.execute("""
                DELETE FROM sound_scene_history
                 WHERE production_id=%s AND revision > %s
            """, (production_id, current))
            cursor.execute("""
                UPDATE sound_scenes
                   SET revision=%s, document=%s::jsonb, updated_at=now()
                 WHERE production_id=%s
            """, (next_revision, json.dumps(canonical), production_id))
            cursor.execute("""
                INSERT INTO sound_scene_history
                    (production_id, revision, document)
                VALUES (%s,%s,%s::jsonb)
            """, (production_id, next_revision, json.dumps(canonical)))
        return self.get(production_id)

    def step(self, production_id: int, direction: int) -> dict[str, Any] | None:
        comparator = "<" if direction < 0 else ">"
        ordering = "DESC" if direction < 0 else "ASC"
        with transaction() as cursor:
            self._ensure(cursor, production_id)
            cursor.execute("""
                SELECT revision FROM sound_scenes
                 WHERE production_id=%s FOR UPDATE
            """, (production_id,))
            row = cursor.fetchone()
            if not row:
                return None
            current = int(row[0])
            cursor.execute(f"""
                SELECT revision, document FROM sound_scene_history
                 WHERE production_id=%s AND revision {comparator} %s
                 ORDER BY revision {ordering} LIMIT 1
            """, (production_id, current))
            target = cursor.fetchone()
            if target:
                cursor.execute("""
                    UPDATE sound_scenes
                       SET revision=%s, document=%s::jsonb, updated_at=now()
                     WHERE production_id=%s
                """, (target[0], json.dumps(target[1]), production_id))
        return self.get(production_id)
