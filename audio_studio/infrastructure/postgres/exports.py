"""Canonical PostgreSQL persistence for immutable Production exports."""

from __future__ import annotations

import json
from typing import Any

from audio_studio.infrastructure.postgres.session import read_only, transaction


EXPORT_FIELDS = (
    "id", "production_id", "generation_id", "filename", "manifest",
    "renderer", "duration_ms", "size_bytes", "created_at",
)


def _export(values) -> dict[str, Any]:
    item = dict(zip(EXPORT_FIELDS, values))
    item["created_at"] = item["created_at"].isoformat()
    return item


class ProductionExportRepository:
    """Own final-file history and its legacy playback projection."""

    def list(self, production_id: int) -> list[dict[str, Any]]:
        with read_only() as cursor:
            cursor.execute(
                f"SELECT {', '.join(EXPORT_FIELDS)} FROM exports "
                "WHERE production_id = %s ORDER BY created_at DESC, id DESC",
                (production_id,),
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

    def create(self, production_id: int, *, filename: str, path: str,
               manifest: dict, renderer: str, duration_ms: int | None,
               size_bytes: int, part_count: int) -> dict[str, int] | None:
        """Atomically create the immutable Export and playback projection."""
        with transaction() as cursor:
            cursor.execute("""
                SELECT production.legacy_container_id, production.name
                  FROM productions production
                  JOIN work_projects project ON project.id = production.project_id
                  JOIN ventures venture ON venture.id = project.venture_id
                 WHERE production.id = %s AND production.archived_at IS NULL
                   AND project.archived_at IS NULL
                   AND venture.archived_at IS NULL
                 FOR SHARE
            """, (production_id,))
            production = cursor.fetchone()
            if not production:
                return None
            legacy_id, production_name = production
            cursor.execute("""
                INSERT INTO generations
                    (text, voice, engine, model, format, filename, path,
                     size_bytes, duration_ms, chars, requests, cost, project_id,
                     production_id, position, kind, title, cost_basis, usage,
                     fidelity, failures)
                VALUES (%s, '-', 'system', '-', 'mp3', %s, %s, %s, %s, 0,
                        %s, 0, %s, %s, NULL, 'stitch', %s, 'not billed',
                        '{}'::jsonb, '{}'::jsonb, '[]'::jsonb)
                RETURNING id
            """, (f"Stitched from {part_count} parts of {production_name}",
                  filename, path, size_bytes, duration_ms, part_count,
                  legacy_id, production_id, f"Full — {part_count} parts"))
            generation_id = int(cursor.fetchone()[0])
            cursor.execute("""
                INSERT INTO exports
                    (production_id, generation_id, filename, manifest, renderer,
                     duration_ms, size_bytes)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (production_id, generation_id, filename,
                  json.dumps(manifest), renderer, duration_ms, size_bytes))
            return {"export_id": int(cursor.fetchone()[0]),
                    "generation_id": generation_id}
