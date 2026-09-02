"""Canonical PostgreSQL persistence for immutable Project exports."""

from __future__ import annotations

import json
from typing import Any

from origins.infrastructure.postgres.session import read_only, transaction


EXPORT_FIELDS = (
    "id", "project_id", "filename", "manifest",
    "renderer", "duration_ms", "size_bytes", "created_at",
)


def _export(values) -> dict[str, Any]:
    item = dict(zip(EXPORT_FIELDS, values))
    item["created_at"] = item["created_at"].isoformat()
    return item


class ProjectExportRepository:
    """Own immutable final-file history without creating a fake speech Part."""

    def list(self, project_id: int) -> list[dict[str, Any]]:
        with read_only() as cursor:
            cursor.execute(
                f"SELECT {', '.join(EXPORT_FIELDS)} FROM exports "
                "WHERE project_id = %s ORDER BY created_at DESC, id DESC",
                (project_id,),
            )
            rows = cursor.fetchall()
        return [_export(row) for row in rows]

    def get(self, export_id: int) -> dict[str, Any] | None:
        with read_only() as cursor:
            cursor.execute(
                f"SELECT {', '.join(EXPORT_FIELDS)} FROM exports WHERE id = %s",
                (export_id,),
            )
            row = cursor.fetchone()
        return _export(row) if row else None

    def create(self, project_id: int, *, filename: str, path: str,
               manifest: dict, renderer: str, duration_ms: int | None,
               size_bytes: int, part_count: int) -> dict[str, int] | None:
        """Atomically create one immutable Export."""
        with transaction() as cursor:
            cursor.execute("""
                SELECT project.id, project.name
                  FROM projects project
                 WHERE project.id = %s
                 FOR SHARE
            """, (project_id,))
            project = cursor.fetchone()
            if not project:
                return None
            cursor.execute("""
                INSERT INTO exports
                    (project_id, filename, manifest, renderer,
                     duration_ms, size_bytes)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (project_id, filename, json.dumps({
                **manifest, "source": "canonical_parts",
                "part_count": part_count, "storage_path": path,
            }), renderer, duration_ms, size_bytes))
            return {"export_id": int(cursor.fetchone()[0])}
