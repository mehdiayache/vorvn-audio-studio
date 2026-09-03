"""Canonical PostgreSQL read/write boundary for audiovisual Productions."""

from __future__ import annotations

import json

from origins.infrastructure.postgres.session import read_only, transaction


def resolve_production_id(identifier: str) -> int | None:
    value = str(identifier or "").strip()
    if not value:
        return None
    with read_only() as cursor:
        cursor.execute("""
            SELECT id FROM productions
             WHERE production_type='audiovisual'
               AND (id::text=%s OR public_id::text=%s)
        """, (value, value))
        row = cursor.fetchone()
    return int(row[0]) if row else None


def get(production_id: int) -> dict | None:
    with read_only() as cursor:
        cursor.execute("""
            SELECT production.id, production.public_id, production.workspace_id,
                   production.folder_id, production.production_type, production.name,
                   production.description, production.status, production.settings,
                   production.updated_at
              FROM productions production
             WHERE production.id=%s AND production.production_type='audiovisual'
        """, (production_id,))
        row = cursor.fetchone()
    if not row:
        return None
    return {
        "id": int(row[0]), "public_id": str(row[1]),
        "workspace_id": int(row[2]), "folder_id": row[3],
        "production_type": row[4], "name": row[5],
        "description": row[6] or "", "status": row[7],
        "settings": row[8] or {},
        "updated_at": row[9].isoformat() if row[9] else None,
    }


def update(production_id: int, changes: dict) -> dict | None:
    allowed = {"name", "description", "status", "settings", "folder_id"}
    values = {key: value for key, value in changes.items() if key in allowed}
    if not values:
        return get(production_id)
    assignments = []
    parameters = []
    for key, value in values.items():
        assignments.append(f"{key}=%s")
        parameters.append(json.dumps(value) if key == "settings" else value)
    parameters.append(production_id)
    with transaction() as cursor:
        cursor.execute(f"""
            UPDATE productions SET {', '.join(assignments)}, updated_at=now()
             WHERE id=%s AND production_type='audiovisual'
             RETURNING id
        """, tuple(parameters))
        if not cursor.fetchone():
            return None
    return get(production_id)


def delete(production_id: int) -> bool:
    """Delete the Production; reusable Workspace Files remain untouched."""
    with transaction() as cursor:
        cursor.execute(
            "SELECT public_id, name FROM productions "
            "WHERE id=%s AND production_type='audiovisual' FOR UPDATE",
            (production_id,),
        )
        production = cursor.fetchone()
        if not production:
            return False
        cursor.execute(
            "DELETE FROM productions WHERE id=%s AND production_type='audiovisual' "
            "RETURNING id",
            (production_id,),
        )
        deleted = cursor.fetchone() is not None
        if deleted:
            cursor.execute("""
                INSERT INTO audit_records
                    (action, resource_type, resource_id, detail)
                VALUES ('production.deleted', 'production', %s, %s::jsonb)
            """, (str(production[0]), json.dumps({"name": production[1]})))
        return deleted
