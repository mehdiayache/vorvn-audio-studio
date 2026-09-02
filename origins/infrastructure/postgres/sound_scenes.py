"""PostgreSQL persistence for versioned Sound Scene documents."""

from __future__ import annotations

from copy import deepcopy
import json
from typing import Any

from origins.domain.sound_scene import (
    SoundSceneRevisionConflict,
    empty_scene,
    merge_linked_visual_audio,
    normalize_scene,
)
from origins.infrastructure.postgres.session import read_only, transaction


class SoundSceneRepository:
    @staticmethod
    def project_exists(project_id: int) -> bool:
        with read_only() as cursor:
            cursor.execute(
                "SELECT 1 FROM projects WHERE id=%s", (project_id,))
            return cursor.fetchone() is not None

    @staticmethod
    def _ensure(cursor, project_id: int) -> None:
        document = empty_scene()
        cursor.execute("""
            INSERT INTO sound_scenes (project_id, document)
            SELECT id, %s::jsonb FROM projects WHERE id=%s
            ON CONFLICT (project_id) DO NOTHING
        """, (json.dumps(document), project_id))
        cursor.execute("""
            INSERT INTO sound_scene_history (project_id, revision, document)
            SELECT project_id, history_revision, document FROM sound_scenes
             WHERE project_id=%s
            ON CONFLICT (project_id, revision) DO NOTHING
        """, (project_id,))

    @staticmethod
    def _history_state(cursor, project_id: int, revision: int) -> tuple[bool, bool]:
        cursor.execute("""
            SELECT EXISTS(
                       SELECT 1 FROM sound_scene_history
                        WHERE project_id=%s AND revision < %s),
                   EXISTS(
                       SELECT 1 FROM sound_scene_history
                        WHERE project_id=%s AND revision > %s)
        """, (project_id, revision, project_id, revision))
        row = cursor.fetchone() or (False, False)
        return bool(row[0]), bool(row[1])

    def get(self, project_id: int) -> dict[str, Any] | None:
        with transaction() as cursor:
            self._ensure(cursor, project_id)
            cursor.execute("""
                SELECT revision, history_revision, document, updated_at
                  FROM sound_scenes WHERE project_id=%s
            """, (project_id,))
            row = cursor.fetchone()
            if not row:
                return None
            can_undo, can_redo = self._history_state(
                cursor, project_id, int(row[1]))
        document = normalize_scene(row[2])
        return {
            "project_id": project_id,
            "revision": int(row[0]),
            "document": document,
            "hydrated_document": self.hydrate(project_id, document),
            "can_undo": can_undo,
            "can_redo": can_redo,
            "updated_at": row[3].isoformat(),
        }

    def hydrate(
        self, project_id: int, document: dict[str, Any],
    ) -> dict[str, Any]:
        result = deepcopy(document)
        clips = [clip for track in result["tracks"] for clip in track["clips"]]
        file_ids = sorted({int(clip["file_id"]) for clip in clips})
        if not file_ids:
            return result
        with read_only() as cursor:
            cursor.execute("""
                SELECT file.id, file.name,
                       COALESCE(file.category, file.kind), file.media_type,
                       version.id, version.filename, version.duration_ms,
                       version.sample_rate, version.channels, version.metadata
                  FROM files file
                  JOIN projects project ON project.id=%s
                  LEFT JOIN file_versions version ON version.file_id=file.id
                 WHERE file.workspace_id=project.workspace_id
                   AND file.id = ANY(%s::bigint[])
                 ORDER BY file.id, version.version DESC
            """, (project_id, file_ids))
            versions: dict[int, list[tuple]] = {}
            for row in cursor.fetchall():
                versions.setdefault(int(row[0]), []).append(row)
        for track in result["tracks"]:
            for clip in track["clips"]:
                candidates = versions.get(int(clip["file_id"]), [])
                requested = clip.get("file_version_id")
                source = (next(
                    (row for row in candidates if row[4] == requested), None,
                ) if requested is not None else
                    (candidates[0] if candidates else None))
                if not source:
                    clip.update({
                        "file_name": "Unavailable file", "filename": "",
                        "source_duration_ms": 0, "missing": True,
                    })
                    continue
                source_media_type = str(source[3] or "")
                version_metadata = source[9] or {}
                has_embedded_audio = bool(
                    source[7] and source[8]
                    or str(version_metadata.get("audio_codec") or "").strip()
                )
                if (source_media_type != "audio"
                        and not (source_media_type == "video"
                                 and has_embedded_audio)):
                    clip.update({
                        "file_name": source[1] or "Visual file",
                        "filename": "", "source_duration_ms": 0,
                        "missing": True,
                        "incompatible_media_type": source_media_type,
                    })
                    continue
                clip.update({
                    "file_name": source[1] or (
                        "Untitled video" if source_media_type == "video"
                        else "Untitled audio"),
                    "file_kind": source[2],
                    "source_media_type": source_media_type,
                    "file_version_id": int(source[4]) if source[4] else None,
                    "filename": source[5] or "",
                    "source_duration_ms": int(source[6] or 0),
                    "missing": not bool(source[5]),
                })
        return result

    def validate_files(
        self, project_id: int, document: dict[str, Any],
    ) -> dict[str, Any]:
        scene = normalize_scene(document)
        hydrated = self.hydrate(project_id, scene)
        for track in hydrated["tracks"]:
            for clip in track["clips"]:
                if clip.get("incompatible_media_type"):
                    raise ValueError(
                        "Sound Scene clips require audio Files or videos "
                        "with embedded audio.")
                if clip.get("missing"):
                    raise ValueError("A Sound Scene File is unavailable.")
        return normalize_scene(hydrated)

    def commit(
        self, project_id: int, expected_revision: int,
        document: dict[str, Any], mutation_kind: str = "operator",
    ) -> dict[str, Any] | None:
        canonical = self.validate_files(project_id, document)
        with transaction() as cursor:
            self._ensure(cursor, project_id)
            cursor.execute("""
                SELECT revision, history_revision, document FROM sound_scenes
                 WHERE project_id=%s FOR UPDATE
            """, (project_id,))
            row = cursor.fetchone()
            if not row:
                return None
            current = int(row[0])
            history_revision = int(row[1])
            if current != int(expected_revision):
                raise SoundSceneRevisionConflict(current)
            next_revision = current + 1
            if mutation_kind == "derived_visual_audio":
                # The incoming projection owns presence and timing only. Merge
                # it with the current document so an older client cannot erase
                # authored linked-audio mix settings during visual deletion.
                canonical = merge_linked_visual_audio(row[2], canonical)
                cursor.execute("""
                    SELECT revision, document FROM sound_scene_history
                     WHERE project_id=%s FOR UPDATE
                """, (project_id,))
                for stored_revision, stored_document in cursor.fetchall():
                    merged = merge_linked_visual_audio(
                        stored_document, canonical)
                    cursor.execute("""
                        UPDATE sound_scene_history SET document=%s::jsonb
                         WHERE project_id=%s AND revision=%s
                    """, (json.dumps(merged), project_id,
                          stored_revision))
                cursor.execute("""
                    UPDATE sound_scenes
                       SET revision=%s, document=%s::jsonb, updated_at=now()
                     WHERE project_id=%s
                """, (next_revision, json.dumps(canonical), project_id))
            else:
                next_history_revision = history_revision + 1
                cursor.execute("""
                    DELETE FROM sound_scene_history
                     WHERE project_id=%s AND revision > %s
                """, (project_id, history_revision))
                cursor.execute("""
                    UPDATE sound_scenes
                       SET revision=%s, history_revision=%s,
                           document=%s::jsonb, updated_at=now()
                     WHERE project_id=%s
                """, (next_revision, next_history_revision,
                      json.dumps(canonical), project_id))
                cursor.execute("""
                    INSERT INTO sound_scene_history
                        (project_id, revision, document)
                    VALUES (%s,%s,%s::jsonb)
                """, (project_id, next_history_revision,
                      json.dumps(canonical)))
            file_ids = sorted({
                int(clip["file_id"])
                for track in canonical["tracks"]
                for clip in track["clips"]
                if clip.get("file_id")
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

    def step(self, project_id: int, direction: int) -> dict[str, Any] | None:
        comparator = "<" if direction < 0 else ">"
        ordering = "DESC" if direction < 0 else "ASC"
        with transaction() as cursor:
            self._ensure(cursor, project_id)
            cursor.execute("""
                SELECT revision, history_revision FROM sound_scenes
                 WHERE project_id=%s FOR UPDATE
            """, (project_id,))
            row = cursor.fetchone()
            if not row:
                return None
            current_revision = int(row[0])
            history_revision = int(row[1])
            cursor.execute(f"""
                SELECT revision, document FROM sound_scene_history
                 WHERE project_id=%s AND revision {comparator} %s
                 ORDER BY revision {ordering} LIMIT 1
            """, (project_id, history_revision))
            target = cursor.fetchone()
            if target:
                cursor.execute("""
                    UPDATE sound_scenes
                       SET revision=%s, history_revision=%s,
                           document=%s::jsonb, updated_at=now()
                     WHERE project_id=%s
                """, (current_revision + 1, target[0],
                      json.dumps(target[1]), project_id))
        return self.get(project_id)
