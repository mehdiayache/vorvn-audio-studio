"""PostgreSQL persistence for the Workspace-first application entry point."""

from __future__ import annotations

from origins.domain.files import file_family
from origins.infrastructure.postgres.session import read_only, transaction


class WorkspaceRepository:
    """Persist the Workspace application root."""

    @staticmethod
    def _workspace_row(row) -> dict:
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

    def list_workspaces(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT workspace.id, workspace.public_id, workspace.name,
                       workspace.description, workspace.created_at, workspace.updated_at,
                       count(DISTINCT project.id),
                       count(DISTINCT file.id),
                       count(DISTINCT folder.id)
                  FROM workspaces workspace
                  LEFT JOIN projects project
                    ON project.workspace_id = workspace.id
                  LEFT JOIN files file ON file.workspace_id = workspace.id
                  LEFT JOIN folders folder ON folder.workspace_id = workspace.id
                 GROUP BY workspace.id
                 ORDER BY workspace.updated_at DESC, workspace.id
            """)
            return [self._workspace_row(row) for row in cursor.fetchall()]

    def workspace(self, workspace_id: int) -> dict | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, public_id, name, description, created_at, updated_at
                  FROM workspaces WHERE id = %s
            """, (workspace_id,))
            row = cursor.fetchone()
        return self._workspace_row(row) if row else None

    def folders(self, workspace_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, public_id, parent_id, name, created_at, updated_at
                  FROM folders WHERE workspace_id = %s
                 ORDER BY parent_id NULLS FIRST, name, id
            """, (workspace_id,))
            return [{
                "id": int(row[0]), "public_id": str(row[1]),
                "workspace_id": workspace_id, "parent_id": row[2], "name": row[3],
                "created_at": row[4].isoformat(), "updated_at": row[5].isoformat(),
            } for row in cursor.fetchall()]

    def projects(self, workspace_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT project.id, project.public_id, project.folder_id,
                       project.project_type, project.name, project.description,
                       project.status, project.updated_at,
                       count(DISTINCT project_file.file_id),
                       count(DISTINCT part.id)
                  FROM projects project
                  LEFT JOIN project_file_usages project_file
                    ON project_file.project_id = project.id
                  LEFT JOIN project_parts part
                    ON part.project_id = project.id
                   AND part.archived_at IS NULL
                 WHERE project.workspace_id = %s
                   AND project.project_type = 'audiovisual'
                 GROUP BY project.id
                 ORDER BY project.updated_at DESC, project.id
            """, (workspace_id,))
            return [{
                "id": int(row[0]), "public_id": str(row[1]),
                "workspace_id": workspace_id, "folder_id": row[2],
                "project_type": row[3], "name": row[4],
                "description": row[5], "status": row[6],
                "updated_at": row[7].isoformat(),
                "file_count": int(row[8]), "part_count": int(row[9]),
            } for row in cursor.fetchall()]

    def files(self, workspace_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT file.id, file.public_id, file.folder_id, file.name,
                       file.source, file.tags, file.metadata,
                       file.created_at, file.updated_at,
                       version.id, version.public_id, version.version,
                       version.filename, version.storage_key,
                       version.size_bytes, version.duration_ms,
                       version.mime_type, version.width, version.height
                  FROM files file
                  JOIN LATERAL (
                       SELECT item.* FROM file_versions item
                        WHERE item.file_id = file.id
                        ORDER BY item.version DESC, item.id DESC LIMIT 1
                  ) version ON true
                 WHERE file.workspace_id = %s
                 ORDER BY file.updated_at DESC, file.id DESC
            """, (workspace_id,))
            files = []
            for row in cursor.fetchall():
                files.append({
                    "id": int(row[0]), "public_id": str(row[1]),
                    "workspace_id": workspace_id, "folder_id": row[2], "name": row[3],
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

    def create_workspace(self, name: str, description: str) -> dict:
        with transaction() as cursor:
            cursor.execute("""
                INSERT INTO workspaces (name, description)
                VALUES (%s, %s)
                RETURNING id, public_id, name, description, created_at, updated_at
            """, (name, description))
            return self._workspace_row(cursor.fetchone())

    def project(self, identifier: str) -> dict | None:
        value = str(identifier or "").strip()
        if not value:
            return None
        with read_only() as cursor:
            cursor.execute("""
                SELECT project.id, project.public_id, project.workspace_id,
                       project.folder_id, project.project_type, project.name,
                       project.description, project.status, project.updated_at,
                       count(DISTINCT project_file.file_id),
                       count(DISTINCT part.id)
                  FROM projects project
                  LEFT JOIN project_file_usages project_file
                    ON project_file.project_id=project.id
                  LEFT JOIN project_parts part
                    ON part.project_id=project.id AND part.archived_at IS NULL
                 WHERE project.workspace_id IS NOT NULL
                   AND project.project_type = 'audiovisual'
                   AND (project.public_id::text=%s OR project.id::text=%s)
                 GROUP BY project.id
            """, (value, value))
            row = cursor.fetchone()
        if not row:
            return None
        return {
            "id": int(row[0]), "public_id": str(row[1]),
            "workspace_id": int(row[2]), "folder_id": row[3],
            "project_type": row[4], "name": row[5],
            "description": row[6], "status": row[7],
            "updated_at": row[8].isoformat(), "file_count": int(row[9]),
            "part_count": int(row[10]),
        }

    def create_folder(
        self, workspace_id: int, name: str, parent_id: int | None,
    ) -> dict | None:
        with transaction() as cursor:
            cursor.execute("SELECT 1 FROM workspaces WHERE id=%s", (workspace_id,))
            if not cursor.fetchone():
                return None
            if parent_id is not None:
                cursor.execute(
                    "SELECT 1 FROM folders WHERE id=%s AND workspace_id=%s",
                    (parent_id, workspace_id))
                if not cursor.fetchone():
                    return None
            cursor.execute("""
                INSERT INTO folders (workspace_id, parent_id, name)
                VALUES (%s, %s, %s)
                RETURNING id, public_id, parent_id, name, created_at, updated_at
            """, (workspace_id, parent_id, name))
            row = cursor.fetchone()
        return {
            "id": int(row[0]), "public_id": str(row[1]), "workspace_id": workspace_id,
            "parent_id": row[2], "name": row[3],
            "created_at": row[4].isoformat(), "updated_at": row[5].isoformat(),
        }

    def create_audiovisual_project(
        self, workspace_id: int, name: str, description: str,
        folder_id: int | None,
    ) -> dict | None:
        with transaction() as cursor:
            cursor.execute("SELECT 1 FROM workspaces WHERE id=%s", (workspace_id,))
            if not cursor.fetchone():
                return None
            if folder_id is not None:
                cursor.execute(
                    "SELECT 1 FROM folders WHERE id=%s AND workspace_id=%s",
                    (folder_id, workspace_id))
                if not cursor.fetchone():
                    return None
            cursor.execute("""
                INSERT INTO projects
                    (workspace_id, folder_id, project_type, name,
                     description, settings)
                VALUES (%s, %s, 'audiovisual', %s, %s, '{}')
                RETURNING id
            """, (workspace_id, folder_id, name, description))
            project_id = int(cursor.fetchone()[0])
            cursor.execute("""
                INSERT INTO sound_scenes (project_id, document)
                VALUES (%s, '{"version":1,"sequence_overrides":{},"tracks":[]}'::jsonb)
                ON CONFLICT (project_id) DO NOTHING
            """, (project_id,))
            cursor.execute("""
                INSERT INTO sound_scene_history
                    (project_id, revision, document)
                SELECT project_id, history_revision, document
                  FROM sound_scenes WHERE project_id=%s
                ON CONFLICT (project_id, revision) DO NOTHING
            """, (project_id,))
            cursor.execute("""
                INSERT INTO visual_scenes (project_id, document)
                VALUES (
                    %s,
                    '{"version":1,"canvas":{"width":1920,"height":1080},"tracks":[]}'::jsonb
                )
                ON CONFLICT (project_id) DO NOTHING
            """, (project_id,))
        return self.project(str(project_id))

    def attach_file(
        self, project_id: int, file_id: int, purpose: str,
    ) -> bool:
        with transaction() as cursor:
            cursor.execute("""
                INSERT INTO project_file_usages (project_id, file_id, purpose)
                SELECT project.id, file.id, %s
                  FROM projects project
                  JOIN files file ON file.id = %s
                 WHERE project.id = %s
                   AND project.project_type = 'audiovisual'
                   AND project.workspace_id = file.workspace_id
                ON CONFLICT (project_id, file_id, purpose) DO NOTHING
                RETURNING project_id
            """, (purpose, file_id, project_id))
            return cursor.fetchone() is not None
