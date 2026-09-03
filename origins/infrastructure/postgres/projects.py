"""PostgreSQL persistence for Workspace-owned Projects."""

from __future__ import annotations

from typing import Any

from origins.infrastructure.postgres.session import read_only, transaction


class ProjectRepository:
    @staticmethod
    def _row(row) -> dict:
        item = {
            "id": int(row[0]), "public_id": str(row[1]),
            "workspace_id": int(row[2]), "folder_id": row[3],
            "name": row[4], "description": row[5] or "",
            "created_at": row[6].isoformat(), "updated_at": row[7].isoformat(),
        }
        if len(row) > 8:
            item["production_count"] = int(row[8])
        return item

    def list_for_workspace(self, workspace_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT project.id, project.public_id, project.workspace_id,
                       project.folder_id, project.name, project.description,
                       project.created_at, project.updated_at,
                       count(production.id)
                  FROM projects project
                  LEFT JOIN productions production ON production.project_id=project.id
                 WHERE project.workspace_id=%s
                 GROUP BY project.id
                 ORDER BY project.updated_at DESC, project.id
            """, (workspace_id,))
            return [self._row(row) for row in cursor.fetchall()]

    def project(self, identifier: str) -> dict | None:
        value = str(identifier or "").strip()
        if not value:
            return None
        with read_only() as cursor:
            cursor.execute("""
                SELECT project.id, project.public_id, project.workspace_id,
                       project.folder_id, project.name, project.description,
                       project.created_at, project.updated_at,
                       count(production.id)
                  FROM projects project
                  LEFT JOIN productions production ON production.project_id=project.id
                 WHERE project.id::text=%s OR project.public_id::text=%s
                 GROUP BY project.id
            """, (value, value))
            row = cursor.fetchone()
        return self._row(row) if row else None

    def productions(self, project_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT production.id, production.public_id, production.workspace_id,
                       production.folder_id, production.project_id,
                       production.production_type, production.name,
                       production.description, production.status,
                       production.updated_at
                  FROM productions production
                 WHERE production.project_id=%s
                 ORDER BY production.updated_at DESC, production.id
            """, (project_id,))
            return [{
                "id": int(row[0]), "public_id": str(row[1]),
                "workspace_id": int(row[2]), "folder_id": row[3],
                "project_id": row[4], "production_type": row[5],
                "name": row[6], "description": row[7] or "",
                "status": row[8], "updated_at": row[9].isoformat(),
            } for row in cursor.fetchall()]

    def create(
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
                INSERT INTO projects (workspace_id, folder_id, name, description)
                VALUES (%s, %s, %s, %s)
                RETURNING id
            """, (workspace_id, folder_id, name, description))
            project_id = int(cursor.fetchone()[0])
        return self.project(str(project_id))

    def update(self, project_id: int, changes: dict[str, Any]) -> dict | None:
        allowed = {"name", "description", "folder_id"}
        values = {key: value for key, value in changes.items() if key in allowed}
        if not values:
            return self.project(str(project_id))
        if "folder_id" in values and values["folder_id"] is not None:
            with read_only() as cursor:
                cursor.execute("""
                    SELECT 1 FROM projects project
                    JOIN folders folder ON folder.id=%s
                   WHERE project.id=%s AND folder.workspace_id=project.workspace_id
                """, (values["folder_id"], project_id))
                if not cursor.fetchone():
                    return None
        assignments = [f"{key}=%s" for key in values]
        parameters = [values[key] for key in values]
        parameters.append(project_id)
        with transaction() as cursor:
            cursor.execute(f"""
                UPDATE projects SET {', '.join(assignments)}, updated_at=now()
                 WHERE id=%s RETURNING id
            """, tuple(parameters))
            if not cursor.fetchone():
                return None
        return self.project(str(project_id))

    def delete(self, project_id: int) -> bool:
        with transaction() as cursor:
            cursor.execute(
                "DELETE FROM projects WHERE id=%s RETURNING id", (project_id,))
            return cursor.fetchone() is not None
