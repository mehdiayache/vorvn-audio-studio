"""PostgreSQL persistence for the Workspace-first application entry point."""

from __future__ import annotations

from origins.infrastructure.postgres.files import FileRepository
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
                "production_count": int(row[6]),
                "file_count": int(row[7]),
                "folder_count": int(row[8]),
            })
        return item

    def list_workspaces(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT workspace.id, workspace.public_id, workspace.name,
                       workspace.description, workspace.created_at, workspace.updated_at,
                       count(DISTINCT production.id),
                       count(DISTINCT file.id),
                       count(DISTINCT folder.id)
                  FROM workspaces workspace
                  LEFT JOIN productions production
                    ON production.workspace_id = workspace.id
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

    def productions(self, workspace_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT production.id, production.public_id, production.folder_id,
                       production.production_type, production.name, production.description,
                       production.status, production.updated_at,
                       count(DISTINCT production_file.file_id),
                       count(DISTINCT part.id)
                  FROM productions production
                  LEFT JOIN production_file_usages production_file
                    ON production_file.production_id = production.id
                  LEFT JOIN production_parts part
                    ON part.production_id = production.id
                   AND part.archived_at IS NULL
                 WHERE production.workspace_id = %s
                   AND production.production_type = 'audiovisual'
                 GROUP BY production.id
                 ORDER BY production.updated_at DESC, production.id
            """, (workspace_id,))
            return [{
                "id": int(row[0]), "public_id": str(row[1]),
                "workspace_id": workspace_id, "folder_id": row[2],
                "production_type": row[3], "name": row[4],
                "description": row[5], "status": row[6],
                "updated_at": row[7].isoformat(),
                "file_count": int(row[8]), "part_count": int(row[9]),
            } for row in cursor.fetchall()]

    def files(self, workspace_id: int) -> list[dict]:
        return FileRepository().list_for_workspace(workspace_id)

    def create_workspace(self, name: str, description: str) -> dict:
        with transaction() as cursor:
            cursor.execute("""
                INSERT INTO workspaces (name, description)
                VALUES (%s, %s)
                RETURNING id, public_id, name, description, created_at, updated_at
            """, (name, description))
            return self._workspace_row(cursor.fetchone())

    def production(self, identifier: str) -> dict | None:
        value = str(identifier or "").strip()
        if not value:
            return None
        with read_only() as cursor:
            cursor.execute("""
                SELECT production.id, production.public_id, production.workspace_id,
                       production.folder_id, production.production_type, production.name,
                       production.description, production.status, production.updated_at,
                       count(DISTINCT production_file.file_id),
                       count(DISTINCT part.id)
                  FROM productions production
                  LEFT JOIN production_file_usages production_file
                    ON production_file.production_id=production.id
                  LEFT JOIN production_parts part
                    ON part.production_id=production.id AND part.archived_at IS NULL
                 WHERE production.workspace_id IS NOT NULL
                   AND production.production_type = 'audiovisual'
                   AND (production.public_id::text=%s OR production.id::text=%s)
                 GROUP BY production.id
            """, (value, value))
            row = cursor.fetchone()
        if not row:
            return None
        return {
            "id": int(row[0]), "public_id": str(row[1]),
            "workspace_id": int(row[2]), "folder_id": row[3],
            "production_type": row[4], "name": row[5],
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

    def create_audiovisual_production(
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
                INSERT INTO productions
                    (workspace_id, folder_id, production_type, name,
                     description, settings)
                VALUES (%s, %s, 'audiovisual', %s, %s, '{}')
                RETURNING id
            """, (workspace_id, folder_id, name, description))
            production_id = int(cursor.fetchone()[0])
            cursor.execute("""
                INSERT INTO sound_scenes (production_id, document)
                VALUES (%s, '{"version":1,"sequence_overrides":{},"tracks":[]}'::jsonb)
                ON CONFLICT (production_id) DO NOTHING
            """, (production_id,))
            cursor.execute("""
                INSERT INTO sound_scene_history
                    (production_id, revision, document)
                SELECT production_id, history_revision, document
                  FROM sound_scenes WHERE production_id=%s
                ON CONFLICT (production_id, revision) DO NOTHING
            """, (production_id,))
            cursor.execute("""
                INSERT INTO visual_scenes (production_id, document)
                VALUES (
                    %s,
                    '{"version":1,"canvas":{"width":1920,"height":1080},"tracks":[]}'::jsonb
                )
                ON CONFLICT (production_id) DO NOTHING
            """, (production_id,))
        return self.production(str(production_id))

    def attach_file(
        self, production_id: int, file_id: int, purpose: str,
    ) -> bool:
        with transaction() as cursor:
            cursor.execute("""
                INSERT INTO production_file_usages (production_id, file_id, purpose)
                SELECT production.id, file.id, %s
                  FROM productions production
                  JOIN files file ON file.id = %s
                 WHERE production.id = %s
                   AND production.production_type = 'audiovisual'
                   AND production.workspace_id = file.workspace_id
                ON CONFLICT (production_id, file_id, purpose) DO NOTHING
                RETURNING production_id
            """, (purpose, file_id, production_id))
            return cursor.fetchone() is not None
