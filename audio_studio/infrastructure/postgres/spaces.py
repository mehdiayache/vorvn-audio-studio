"""PostgreSQL persistence for the Space-first application entry point."""

from __future__ import annotations

from audio_studio.domain.files import file_family
from audio_studio.infrastructure.postgres.session import read_only, transaction


class SpaceRepository:
    """Persist the application root without legacy container mirrors."""

    @staticmethod
    def _space_row(row) -> dict:
        item = {
            "id": int(row[0]), "public_id": str(row[1]), "name": row[2],
            "description": row[3],
            "created_at": row[4].isoformat(), "updated_at": row[5].isoformat(),
        }
        if len(row) > 6:
            item.update({
                "project_count": int(row[6]),
                "file_count": int(row[7]),
                "folder_count": int(row[8]),
            })
        return item

    def list_spaces(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT space.id, space.public_id, space.name,
                       space.description, space.created_at, space.updated_at,
                       count(DISTINCT project.id),
                       count(DISTINCT file.id),
                       count(DISTINCT folder.id)
                  FROM spaces space
                  LEFT JOIN productions project
                    ON project.space_id = space.id
                   AND project.archived_at IS NULL
                  LEFT JOIN assets file ON file.space_id = space.id
                  LEFT JOIN folders folder ON folder.space_id = space.id
                 GROUP BY space.id
                 ORDER BY space.updated_at DESC, space.id
            """)
            return [self._space_row(row) for row in cursor.fetchall()]

    def space(self, space_id: int) -> dict | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, public_id, name, description, created_at, updated_at
                  FROM spaces WHERE id = %s
            """, (space_id,))
            row = cursor.fetchone()
        return self._space_row(row) if row else None

    def folders(self, space_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, public_id, parent_id, name, created_at, updated_at
                  FROM folders WHERE space_id = %s
                 ORDER BY parent_id NULLS FIRST, name, id
            """, (space_id,))
            return [{
                "id": int(row[0]), "public_id": str(row[1]),
                "space_id": space_id, "parent_id": row[2], "name": row[3],
                "created_at": row[4].isoformat(), "updated_at": row[5].isoformat(),
            } for row in cursor.fetchall()]

    def projects(self, space_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT project.id, project.public_id, project.folder_id,
                       project.project_type, project.name, project.description,
                       project.status, project.updated_at,
                       count(DISTINCT project_file.file_id),
                       count(DISTINCT part.id)
                  FROM productions project
                  LEFT JOIN project_files project_file
                    ON project_file.project_id = project.id
                  LEFT JOIN production_parts part
                    ON part.production_id = project.id
                   AND part.archived_at IS NULL
                 WHERE project.space_id = %s
                   AND project.project_type = 'audiovisual'
                   AND project.archived_at IS NULL
                 GROUP BY project.id
                 ORDER BY project.updated_at DESC, project.id
            """, (space_id,))
            return [{
                "id": int(row[0]), "public_id": str(row[1]),
                "space_id": space_id, "folder_id": row[2],
                "project_type": row[3], "name": row[4],
                "description": row[5], "status": row[6],
                "updated_at": row[7].isoformat(),
                "file_count": int(row[8]), "part_count": int(row[9]),
            } for row in cursor.fetchall()]

    def files(self, space_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT file.id, file.public_id, file.folder_id, file.name,
                       file.source, file.tags, file.metadata,
                       file.created_at, file.updated_at,
                       version.id, version.public_id, version.version,
                       version.filename, version.storage_key,
                       version.size_bytes, version.duration_ms,
                       version.mime_type, version.width, version.height
                  FROM assets file
                  JOIN LATERAL (
                       SELECT item.* FROM asset_versions item
                        WHERE item.asset_id = file.id
                        ORDER BY item.version DESC, item.id DESC LIMIT 1
                  ) version ON true
                 WHERE file.space_id = %s
                 ORDER BY file.updated_at DESC, file.id DESC
            """, (space_id,))
            files = []
            for row in cursor.fetchall():
                files.append({
                    "id": int(row[0]), "public_id": str(row[1]),
                    "space_id": space_id, "folder_id": row[2], "name": row[3],
                    "source": row[4], "tags": row[5] or [],
                    "metadata": row[6] or {},
                    "created_at": row[7].isoformat(),
                    "updated_at": row[8].isoformat(),
                    "current_version": {
                        "id": int(row[9]), "public_id": str(row[10]),
                        "version": int(row[11]), "filename": row[12],
                        "storage_key": row[13], "size_bytes": int(row[14]),
                        "duration_ms": row[15], "mime_type": row[16],
                        "family": file_family(row[16]),
                        "url": (
                            f"/audio/{row[12]}"
                            if file_family(row[16]) == "audio"
                            else f"/media/{row[12]}"
                        ),
                        "width": row[17], "height": row[18],
                    },
                })
            return files

    def create_space(self, name: str, description: str) -> dict:
        with transaction() as cursor:
            cursor.execute("""
                INSERT INTO spaces (name, description)
                VALUES (%s, %s)
                RETURNING id, public_id, name, description, created_at, updated_at
            """, (name, description))
            return self._space_row(cursor.fetchone())

    def project(self, identifier: str) -> dict | None:
        value = str(identifier or "").strip()
        if not value:
            return None
        with read_only() as cursor:
            cursor.execute("""
                SELECT project.id, project.public_id, project.space_id,
                       project.folder_id, project.project_type, project.name,
                       project.description, project.status, project.updated_at,
                       count(DISTINCT project_file.file_id),
                       count(DISTINCT part.id)
                  FROM productions project
                  LEFT JOIN project_files project_file
                    ON project_file.project_id=project.id
                  LEFT JOIN production_parts part
                    ON part.production_id=project.id AND part.archived_at IS NULL
                 WHERE project.archived_at IS NULL
                   AND project.space_id IS NOT NULL
                   AND project.project_type = 'audiovisual'
                   AND (project.public_id::text=%s OR project.id::text=%s)
                 GROUP BY project.id
            """, (value, value))
            row = cursor.fetchone()
        if not row:
            return None
        return {
            "id": int(row[0]), "public_id": str(row[1]),
            "space_id": int(row[2]), "folder_id": row[3],
            "project_type": row[4], "name": row[5],
            "description": row[6], "status": row[7],
            "updated_at": row[8].isoformat(), "file_count": int(row[9]),
            "part_count": int(row[10]),
        }

    def create_folder(
        self, space_id: int, name: str, parent_id: int | None,
    ) -> dict | None:
        with transaction() as cursor:
            cursor.execute("SELECT 1 FROM spaces WHERE id=%s", (space_id,))
            if not cursor.fetchone():
                return None
            if parent_id is not None:
                cursor.execute(
                    "SELECT 1 FROM folders WHERE id=%s AND space_id=%s",
                    (parent_id, space_id))
                if not cursor.fetchone():
                    return None
            cursor.execute("""
                INSERT INTO folders (space_id, parent_id, name)
                VALUES (%s, %s, %s)
                RETURNING id, public_id, parent_id, name, created_at, updated_at
            """, (space_id, parent_id, name))
            row = cursor.fetchone()
        return {
            "id": int(row[0]), "public_id": str(row[1]), "space_id": space_id,
            "parent_id": row[2], "name": row[3],
            "created_at": row[4].isoformat(), "updated_at": row[5].isoformat(),
        }

    def create_audiovisual_project(
        self, space_id: int, name: str, description: str,
        folder_id: int | None,
    ) -> dict | None:
        with transaction() as cursor:
            cursor.execute("SELECT 1 FROM spaces WHERE id=%s", (space_id,))
            if not cursor.fetchone():
                return None
            if folder_id is not None:
                cursor.execute(
                    "SELECT 1 FROM folders WHERE id=%s AND space_id=%s",
                    (folder_id, space_id))
                if not cursor.fetchone():
                    return None
            cursor.execute("""
                INSERT INTO productions
                    (space_id, folder_id, project_type, slug, name,
                     description, settings)
                VALUES (%s, %s, 'audiovisual',
                        'pending-' || gen_random_uuid()::text, %s, %s, '{}')
                RETURNING id
            """, (space_id, folder_id, name, description))
            project_id = int(cursor.fetchone()[0])
            cursor.execute(
                "UPDATE productions SET slug=%s WHERE id=%s",
                (f"audiovisual-{project_id}", project_id),
            )
            cursor.execute("""
                INSERT INTO sound_scenes (production_id, document)
                VALUES (%s, '{"version":1,"sequence_overrides":{},"tracks":[]}'::jsonb)
                ON CONFLICT (production_id) DO NOTHING
            """, (project_id,))
            cursor.execute("""
                INSERT INTO sound_scene_history
                    (production_id, revision, document)
                SELECT production_id, history_revision, document
                  FROM sound_scenes WHERE production_id=%s
                ON CONFLICT (production_id, revision) DO NOTHING
            """, (project_id,))
            cursor.execute("""
                INSERT INTO visual_scenes (production_id)
                VALUES (%s) ON CONFLICT (production_id) DO NOTHING
            """, (project_id,))
        return self.project(str(project_id))

    def attach_file(
        self, project_id: int, file_id: int, purpose: str,
    ) -> bool:
        with transaction() as cursor:
            cursor.execute("""
                INSERT INTO project_files (project_id, file_id, purpose)
                SELECT project.id, file.id, %s
                  FROM productions project
                  JOIN assets file ON file.id = %s
                 WHERE project.id = %s
                   AND project.project_type = 'audiovisual'
                   AND project.space_id = file.space_id
                   AND project.archived_at IS NULL
                ON CONFLICT (project_id, file_id) DO UPDATE
                   SET purpose = EXCLUDED.purpose
                RETURNING project_id
            """, (purpose, file_id, project_id))
            return cursor.fetchone() is not None
