"""PostgreSQL persistence for Venture-owned visual reference sets."""

from __future__ import annotations

from audio_studio.domain.saved_references import SavedReferenceDraft
from audio_studio.infrastructure.postgres.session import read_only, transaction


class SavedReferenceRepository:
    def list(self, venture_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT reference.public_id, reference.name,
                       reference.reference_type, reference.created_at,
                       reference.updated_at,
                       COALESCE(array_agg(link.asset_id ORDER BY link.position)
                           FILTER (WHERE link.asset_id IS NOT NULL), '{}')
                  FROM saved_visual_references reference
                  LEFT JOIN saved_visual_reference_assets link
                    ON link.reference_id = reference.id
                 WHERE reference.venture_id = %s
                 GROUP BY reference.id
                 ORDER BY reference.updated_at DESC, reference.id DESC
            """, (venture_id,))
            return [self._record(row) for row in cursor.fetchall()]

    def create(
        self, venture_id: int, draft: SavedReferenceDraft,
    ) -> dict | None:
        with transaction() as cursor:
            cursor.execute(
                "SELECT 1 FROM ventures WHERE id = %s AND archived_at IS NULL",
                (venture_id,),
            )
            if not cursor.fetchone():
                return None
            cursor.execute("""
                SELECT id FROM assets
                 WHERE venture_id = %s AND id = ANY(%s)
            """, (venture_id, list(draft.asset_ids)))
            available = {int(row[0]) for row in cursor.fetchall()}
            if available != set(draft.asset_ids):
                raise ValueError(
                    "Every saved reference media item must belong to this Venture.")
            cursor.execute("""
                INSERT INTO saved_visual_references
                    (venture_id, name, reference_type)
                VALUES (%s, %s, %s)
                RETURNING id, public_id, name, reference_type,
                          created_at, updated_at
            """, (venture_id, draft.name, draft.reference_type))
            row = cursor.fetchone()
            if not row:
                return None
            for position, asset_id in enumerate(draft.asset_ids):
                cursor.execute("""
                    INSERT INTO saved_visual_reference_assets
                        (reference_id, asset_id, position)
                    VALUES (%s, %s, %s)
                """, (row[0], asset_id, position))
            return self._record((*row[1:], list(draft.asset_ids)))

    def delete(self, venture_id: int, reference_id: str) -> bool | None:
        with transaction() as cursor:
            cursor.execute("""
                DELETE FROM saved_visual_references
                 WHERE venture_id = %s AND public_id = %s
                RETURNING id
            """, (venture_id, reference_id))
            return True if cursor.fetchone() else None

    @staticmethod
    def _record(row: tuple) -> dict:
        public_id, name, reference_type, created_at, updated_at, asset_ids = row
        return {
            "id": str(public_id), "name": name, "type": reference_type,
            "asset_ids": [int(value) for value in asset_ids],
            "created_at": created_at.isoformat(),
            "updated_at": updated_at.isoformat(),
        }
