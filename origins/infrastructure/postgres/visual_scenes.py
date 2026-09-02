"""PostgreSQL persistence for revisioned Visual Scene documents."""

from __future__ import annotations

import json
from typing import Any

from origins.domain.visual_scene import (
    VisualSceneRevisionConflict,
    empty_scene,
    normalize_scene,
)
from origins.infrastructure.postgres.session import read_only, transaction


class VisualSceneRepository:
    @staticmethod
    def _ensure(cursor, project_id: int) -> None:
        cursor.execute("""
            INSERT INTO visual_scenes (project_id, document)
            SELECT id, %s::jsonb FROM projects
             WHERE id=%s AND status <> 'archived'
            ON CONFLICT (project_id) DO NOTHING
        """, (json.dumps(empty_scene()), project_id))

    def get(self, project_id: int) -> dict[str, Any] | None:
        with transaction() as cursor:
            self._ensure(cursor, project_id)
            cursor.execute("""
                SELECT revision, document, updated_at
                  FROM visual_scenes WHERE project_id=%s
            """, (project_id,))
            row = cursor.fetchone()
        if not row:
            return None
        return {
            "project_id": project_id,
            "revision": int(row[0]),
            "document": normalize_scene(row[1]),
            "updated_at": row[2].isoformat(),
        }

    def for_render(self, project_id: int) -> dict[str, Any] | None:
        """Return canonical placements with their current local media sources."""
        scene = self.get(project_id)
        if not scene:
            return None
        file_ids = sorted({
            clip["file_id"]
            for track in scene["document"]["tracks"]
            for clip in track["clips"]
        })
        sources = self._file_sources(project_id, file_ids)
        return {
            **scene,
            "sources": {
                str(file_id): {"file_id": file_id, **source}
                for file_id, source in sources.items()
            },
        }

    @staticmethod
    def _file_sources(
        project_id: int, file_ids: list[int],
    ) -> dict[int, dict[str, Any]]:
        if not file_ids:
            return {}
        with read_only() as cursor:
            cursor.execute("""
                SELECT file.id, file.media_type, version.filename,
                       version.duration_ms
                  FROM files file
                  JOIN projects project ON project.id=%s
                  LEFT JOIN LATERAL (
                      SELECT item.filename, item.duration_ms
                        FROM file_versions item
                       WHERE item.file_id=file.id
                       ORDER BY item.version DESC LIMIT 1
                  ) version ON true
                 WHERE file.workspace_id=project.workspace_id
                   AND file.id = ANY(%s::bigint[])
            """, (project_id, file_ids))
            return {
                int(row[0]): {
                    "media_type": row[1], "filename": row[2] or "",
                    "duration_ms": int(row[3] or 0),
                }
                for row in cursor.fetchall()
            }

    def validate_files(
        self, project_id: int, document: dict[str, Any],
    ) -> dict[str, Any]:
        scene = normalize_scene(document)
        clips = [
            clip for track in scene["tracks"] for clip in track["clips"]
        ]
        sources = self._file_sources(
            project_id, sorted({clip["file_id"] for clip in clips}))
        for track in scene["tracks"]:
            for clip in track["clips"]:
                source = sources.get(clip["file_id"])
                if not source or not source["filename"]:
                    raise ValueError("A Visual Scene File is unavailable.")
                media_type = source["media_type"]
                if media_type not in {"image", "video"}:
                    raise ValueError(
                        "Visual Scene clips require image or video Files.")
                if track["media_type"] != media_type:
                    raise ValueError(
                        f"A {media_type} File requires a "
                        f"{media_type.title()} track.")
                if media_type == "image" and clip["source_offset_ms"]:
                    raise ValueError("Image clips cannot have a source offset.")
                if media_type == "video":
                    source_duration = source["duration_ms"]
                    if source_duration <= 0:
                        raise ValueError(
                            "That video File has no usable duration.")
                    if (clip["source_offset_ms"] + clip["duration_ms"]
                            > source_duration):
                        raise ValueError(
                            "That video clip exceeds its source duration.")
        return scene

    def commit(
        self, project_id: int, expected_revision: int,
        document: dict[str, Any],
    ) -> dict[str, Any] | None:
        canonical = normalize_scene(document)
        with transaction() as cursor:
            self._ensure(cursor, project_id)
            cursor.execute("""
                SELECT revision FROM visual_scenes
                 WHERE project_id=%s FOR UPDATE
            """, (project_id,))
            row = cursor.fetchone()
            if not row:
                return None
            current = int(row[0])
            if current != int(expected_revision):
                raise VisualSceneRevisionConflict(current)
            canonical = self.validate_files(project_id, canonical)
            cursor.execute("""
                UPDATE visual_scenes
                   SET revision=%s, document=%s::jsonb, updated_at=now()
                 WHERE project_id=%s
            """, (
                current + 1, json.dumps(canonical), project_id,
            ))
            file_ids = sorted({
                int(clip["file_id"])
                for track in canonical["tracks"]
                for clip in track["clips"]
            })
            if file_ids:
                cursor.execute("""
                    INSERT INTO project_file_usages (project_id, file_id, purpose)
                    SELECT project.id, file.id, 'timeline'
                      FROM projects project
                      JOIN files file ON file.id=ANY(%s)
                     WHERE project.id=%s
                       AND project.project_type='audiovisual'
                       AND project.workspace_id=file.workspace_id
                    ON CONFLICT (project_id, file_id, purpose) DO NOTHING
                """, (file_ids, project_id))
        return self.get(project_id)
