"""Minimal PostgreSQL lookup for public Generation media."""

from __future__ import annotations

from audio_studio.infrastructure.postgres.session import read_only


class MediaLookupRepository:
    """Resolve database identity to a contained output filename only."""

    def generation(self, generation_id: int) -> dict | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, filename FROM generations
                 WHERE id = %s AND filename <> ''
            """, (generation_id,))
            row = cursor.fetchone()
        return ({"id": int(row[0]), "filename": row[1]} if row else None)
