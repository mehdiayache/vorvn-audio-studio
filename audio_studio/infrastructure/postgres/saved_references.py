"""PostgreSQL persistence for owner-scoped visual reference sets."""

from __future__ import annotations

from audio_studio.domain.saved_references import SavedReferenceDraft
from audio_studio.infrastructure.postgres.session import read_only, transaction


class SavedReferenceRepository:
    def list(self, venture_id: int) -> list[dict]:
        return self._list("venture_id", venture_id)

    def list_space(self, space_id: int) -> list[dict]:
        return self._list("space_id", space_id)

    def _list(self, owner_column: str, owner_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute(f"""
                SELECT reference.public_id, reference.name,
                       reference.reference_type, reference.created_at,
                       reference.updated_at,
                       COALESCE(array_agg(link.asset_id ORDER BY link.position)
                           FILTER (WHERE link.asset_id IS NOT NULL), '{{}}')
                  FROM saved_visual_references reference
                  LEFT JOIN saved_visual_reference_assets link
                    ON link.reference_id = reference.id
                 WHERE reference.{owner_column} = %s
                 GROUP BY reference.id
                 ORDER BY reference.updated_at DESC, reference.id DESC
            """, (owner_id,))
            return [self._record(row) for row in cursor.fetchall()]

    def create(
        self, venture_id: int, draft: SavedReferenceDraft,
    ) -> dict | None:
        return self._create(
            owner_table="ventures", owner_column="venture_id",
            owner_id=venture_id, file_owner_column="venture_id",
            owner_label="Venture", draft=draft)

    def create_space(
        self, space_id: int, draft: SavedReferenceDraft,
    ) -> dict | None:
        return self._create(
            owner_table="spaces", owner_column="space_id", owner_id=space_id,
            file_owner_column="space_id", owner_label="Space", draft=draft)

    def _create(
        self, *, owner_table: str, owner_column: str, owner_id: int,
        file_owner_column: str, owner_label: str,
        draft: SavedReferenceDraft,
    ) -> dict | None:
        with transaction() as cursor:
            archived_filter = " AND archived_at IS NULL" if owner_table == "ventures" else ""
            cursor.execute(
                f"SELECT 1 FROM {owner_table} WHERE id = %s{archived_filter}",
                (owner_id,))
            if not cursor.fetchone():
                return None
            cursor.execute(f"""
                SELECT id FROM assets
                 WHERE {file_owner_column} = %s
                   AND media_type IN ('image', 'video')
                   AND id = ANY(%s)
            """, (owner_id, list(draft.asset_ids)))
            available = {int(row[0]) for row in cursor.fetchall()}
            if available != set(draft.asset_ids):
                raise ValueError(
                    f"Every saved reference media item must belong to this {owner_label}.")
            cursor.execute(f"""
                INSERT INTO saved_visual_references
                    ({owner_column}, name, reference_type)
                VALUES (%s, %s, %s)
                RETURNING id, public_id, name, reference_type,
                          created_at, updated_at
            """, (owner_id, draft.name, draft.reference_type))
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
        return self._delete("venture_id", venture_id, reference_id)

    def delete_space(self, space_id: int, reference_id: str) -> bool | None:
        return self._delete("space_id", space_id, reference_id)

    def _delete(
        self, owner_column: str, owner_id: int, reference_id: str,
    ) -> bool | None:
        with transaction() as cursor:
            cursor.execute(f"""
                DELETE FROM saved_visual_references
                 WHERE {owner_column} = %s AND public_id = %s
                RETURNING id
            """, (owner_id, reference_id))
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
