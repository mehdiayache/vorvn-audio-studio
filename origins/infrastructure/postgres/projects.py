"""Canonical PostgreSQL read/write boundary for audiovisual Projects."""

from __future__ import annotations

import json

from origins.infrastructure.postgres.session import read_only, transaction


def resolve_project_id(identifier: str) -> int | None:
    value = str(identifier or "").strip()
    if not value:
        return None
    with read_only() as cursor:
        cursor.execute("""
            SELECT id FROM projects
             WHERE project_type='audiovisual'
               AND (id::text=%s OR public_id::text=%s)
        """, (value, value))
        row = cursor.fetchone()
    return int(row[0]) if row else None


def get(project_id: int) -> dict | None:
    with read_only() as cursor:
        cursor.execute("""
            SELECT project.id, project.public_id, project.workspace_id,
                   project.folder_id, project.project_type, project.name,
                   project.description, project.status, project.settings,
                   project.updated_at
              FROM projects project
             WHERE project.id=%s AND project.project_type='audiovisual'
        """, (project_id,))
        row = cursor.fetchone()
    if not row:
        return None
    return {
        "id": int(row[0]), "public_id": str(row[1]),
        "workspace_id": int(row[2]), "folder_id": row[3],
        "project_type": row[4], "name": row[5],
        "description": row[6] or "", "status": row[7],
        "settings": row[8] or {},
        "updated_at": row[9].isoformat() if row[9] else None,
    }


def update(project_id: int, changes: dict) -> dict | None:
    allowed = {"name", "description", "status", "settings", "folder_id"}
    values = {key: value for key, value in changes.items() if key in allowed}
    if not values:
        return get(project_id)
    assignments = []
    parameters = []
    for key, value in values.items():
        assignments.append(f"{key}=%s")
        parameters.append(json.dumps(value) if key == "settings" else value)
    parameters.append(project_id)
    with transaction() as cursor:
        cursor.execute(f"""
            UPDATE projects SET {', '.join(assignments)}, updated_at=now()
             WHERE id=%s AND project_type='audiovisual'
             RETURNING id
        """, tuple(parameters))
        if not cursor.fetchone():
            return None
    return get(project_id)


def delete(project_id: int) -> bool:
    """Delete the Project; reusable Workspace Files remain untouched."""
    with transaction() as cursor:
        cursor.execute(
            "SELECT public_id, name FROM projects "
            "WHERE id=%s AND project_type='audiovisual' FOR UPDATE",
            (project_id,),
        )
        project = cursor.fetchone()
        if not project:
            return False
        cursor.execute(
            "DELETE FROM projects WHERE id=%s AND project_type='audiovisual' "
            "RETURNING id",
            (project_id,),
        )
        deleted = cursor.fetchone() is not None
        if deleted:
            cursor.execute("""
                INSERT INTO audit_records
                    (action, resource_type, resource_id, detail)
                VALUES ('project.deleted', 'project', %s, %s::jsonb)
            """, (str(project[0]), json.dumps({"name": project[1]})))
        return deleted
