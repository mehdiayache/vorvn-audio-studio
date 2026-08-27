"""PostgreSQL persistence for revisioned Visual Scene documents."""

from __future__ import annotations

import json
from typing import Any

from audio_studio.domain.visual_scene import (
    VisualSceneRevisionConflict,
    empty_scene,
    normalize_scene,
)
from audio_studio.infrastructure.postgres.session import read_only, transaction


class VisualSceneRepository:
    @staticmethod
    def _ensure(cursor, production_id: int) -> None:
        cursor.execute("""
            INSERT INTO visual_scenes (production_id, document)
            SELECT id, %s::jsonb FROM productions
             WHERE id=%s AND archived_at IS NULL
            ON CONFLICT (production_id) DO NOTHING
        """, (json.dumps(empty_scene()), production_id))

    def get(self, production_id: int) -> dict[str, Any] | None:
        with transaction() as cursor:
            self._ensure(cursor, production_id)
            cursor.execute("""
                SELECT revision, document, updated_at
                  FROM visual_scenes WHERE production_id=%s
            """, (production_id,))
            row = cursor.fetchone()
        if not row:
            return None
        return {
            "production_id": production_id,
            "revision": int(row[0]),
            "document": normalize_scene(row[1]),
            "updated_at": row[2].isoformat(),
        }

    @staticmethod
    def _asset_sources(
        production_id: int, asset_ids: list[int],
    ) -> dict[int, dict[str, Any]]:
        if not asset_ids:
            return {}
        with read_only() as cursor:
            cursor.execute("""
                SELECT asset.id, asset.media_type, version.filename,
                       version.duration_ms
                  FROM assets asset
                  JOIN productions production ON production.id=%s
                  JOIN work_projects project ON project.id=production.project_id
                  LEFT JOIN LATERAL (
                      SELECT item.filename, item.duration_ms
                        FROM asset_versions item
                       WHERE item.asset_id=asset.id
                       ORDER BY item.version DESC LIMIT 1
                  ) version ON true
                 WHERE (asset.venture_id=project.venture_id
                        OR asset.scope='studio')
                   AND asset.id = ANY(%s::bigint[])
            """, (production_id, asset_ids))
            return {
                int(row[0]): {
                    "media_type": row[1], "filename": row[2] or "",
                    "duration_ms": int(row[3] or 0),
                }
                for row in cursor.fetchall()
            }

    def validate_assets(
        self, production_id: int, document: dict[str, Any],
    ) -> dict[str, Any]:
        scene = normalize_scene(document)
        clips = [
            clip for track in scene["tracks"] for clip in track["clips"]
        ]
        sources = self._asset_sources(
            production_id, sorted({clip["asset_id"] for clip in clips}))
        for track in scene["tracks"]:
            for clip in track["clips"]:
                source = sources.get(clip["asset_id"])
                if not source or not source["filename"]:
                    raise ValueError("A Visual Scene Asset is unavailable.")
                media_type = source["media_type"]
                if media_type not in {"image", "video"}:
                    raise ValueError(
                        "Visual Scene clips require image or video Assets.")
                if track["media_type"] != media_type:
                    raise ValueError(
                        f"A {media_type} Asset requires a "
                        f"{media_type.title()} track.")
                if media_type == "image" and clip["source_offset_ms"]:
                    raise ValueError("Image clips cannot have a source offset.")
                if media_type == "video":
                    source_duration = source["duration_ms"]
                    if source_duration <= 0:
                        raise ValueError(
                            "That video Asset has no usable duration.")
                    if (clip["source_offset_ms"] + clip["duration_ms"]
                            > source_duration):
                        raise ValueError(
                            "That video clip exceeds its source duration.")
        return scene

    def commit(
        self, production_id: int, expected_revision: int,
        document: dict[str, Any],
    ) -> dict[str, Any] | None:
        canonical = normalize_scene(document)
        with transaction() as cursor:
            self._ensure(cursor, production_id)
            cursor.execute("""
                SELECT revision FROM visual_scenes
                 WHERE production_id=%s FOR UPDATE
            """, (production_id,))
            row = cursor.fetchone()
            if not row:
                return None
            current = int(row[0])
            if current != int(expected_revision):
                raise VisualSceneRevisionConflict(current)
            canonical = self.validate_assets(production_id, canonical)
            cursor.execute("""
                UPDATE visual_scenes
                   SET revision=%s, document=%s::jsonb, updated_at=now()
                 WHERE production_id=%s
            """, (
                current + 1, json.dumps(canonical), production_id,
            ))
        return self.get(production_id)
