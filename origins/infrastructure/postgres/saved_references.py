"""PostgreSQL persistence for owner-scoped visual reference sets."""

from __future__ import annotations

from origins.domain.saved_references import SavedReferenceDraft
from origins.infrastructure.postgres.session import read_only, transaction


class SavedReferenceRepository:
    def list(self, workspace_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute(f"""
                SELECT reference.public_id, reference.name,
                       reference.reference_type, reference.created_at,
                       reference.updated_at,
                       COALESCE(array_agg(link.file_id ORDER BY link.position)
                           FILTER (WHERE link.file_id IS NOT NULL), '{{}}')
                  FROM saved_visual_references reference
                  LEFT JOIN saved_visual_reference_files link
                    ON link.reference_id = reference.id
                 WHERE reference.workspace_id = %s
                 GROUP BY reference.id
                 ORDER BY reference.updated_at DESC, reference.id DESC
            """, (workspace_id,))
            return [self._record(row) for row in cursor.fetchall()]

    def create(
        self, workspace_id: int, draft: SavedReferenceDraft,
    ) -> dict | None:
        with transaction() as cursor:
            cursor.execute("SELECT 1 FROM workspaces WHERE id=%s", (workspace_id,))
            if not cursor.fetchone():
                return None
            cursor.execute(f"""
                SELECT id FROM files
                 WHERE workspace_id = %s
                   AND media_type IN ('image', 'video')
                   AND id = ANY(%s)
            """, (workspace_id, list(draft.file_ids)))
            available = {int(row[0]) for row in cursor.fetchall()}
            if available != set(draft.file_ids):
                raise ValueError(
                    "Every saved reference media item must belong to this Workspace.")
            cursor.execute("""
                INSERT INTO saved_visual_references
                    (workspace_id, name, reference_type)
                VALUES (%s, %s, %s)
                RETURNING id, public_id, name, reference_type,
                          created_at, updated_at
            """, (workspace_id, draft.name, draft.reference_type))
            row = cursor.fetchone()
            if not row:
                return None
            for position, file_id in enumerate(draft.file_ids):
                cursor.execute("""
                    INSERT INTO saved_visual_reference_files
                        (reference_id, file_id, position)
                    VALUES (%s, %s, %s)
                """, (row[0], file_id, position))
            return self._record((*row[1:], list(draft.file_ids)))

    def delete(self, workspace_id: int, reference_id: str) -> bool | None:
        with transaction() as cursor:
            cursor.execute(f"""
                DELETE FROM saved_visual_references
                 WHERE workspace_id = %s AND public_id = %s
                RETURNING id
            """, (workspace_id, reference_id))
            return True if cursor.fetchone() else None

    @staticmethod
    def _record(row: tuple) -> dict:
        public_id, name, reference_type, created_at, updated_at, file_ids = row
        return {
            "id": str(public_id), "name": name, "type": reference_type,
            "file_ids": [int(value) for value in file_ids],
            "created_at": created_at.isoformat(),
            "updated_at": updated_at.isoformat(),
        }
