"""PostgreSQL persistence for the Space-first application entry point."""

from __future__ import annotations

from audio_studio.domain.files import file_family
from audio_studio.infrastructure.postgres import work as legacy_work
from audio_studio.infrastructure.postgres.session import read_only, transaction


class SpaceRepository:
    """Own the new root while the final migration removes legacy containers."""

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
                 WHERE project.space_id = %s AND project.archived_at IS NULL
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
        # Temporary write bridge: existing provider/editor services still read
        # the Venture table. The final cutover deletes this paired row.
        venture = legacy_work.create_venture(name, description)
        with transaction() as cursor:
            cursor.execute("""
                INSERT INTO spaces (id, public_id, name, description)
                SELECT id, public_id, name, description FROM ventures WHERE id=%s
                ON CONFLICT (id) DO UPDATE SET
                    name=EXCLUDED.name, description=EXCLUDED.description,
                    updated_at=now()
                RETURNING id, public_id, name, description, created_at, updated_at
            """, (venture["id"],))
            return self._space_row(cursor.fetchone())

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
        with read_only() as cursor:
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
                SELECT id FROM work_projects
                 WHERE venture_id=%s AND archived_at IS NULL
                 ORDER BY created_at, id LIMIT 1
            """, (space_id,))
            bridge = cursor.fetchone()
        if bridge:
            work_project_id = int(bridge[0])
        else:
            work_project = legacy_work.create_project(
                space_id, "Projects", "Temporary cutover container")
            if not work_project:
                return None
            work_project_id = int(work_project["id"])
        project = legacy_work.create_production(
            work_project_id, name, description)
        if not project:
            return None
        with transaction() as cursor:
            cursor.execute("""
                UPDATE productions
                   SET space_id=%s, folder_id=%s, project_type='audiovisual',
                       updated_at=now()
                 WHERE id=%s
            """, (space_id, folder_id, project["id"]))
        return next(
            item for item in self.projects(space_id)
            if item["id"] == int(project["id"]))
