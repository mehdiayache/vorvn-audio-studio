"""Canonical PostgreSQL persistence for transcripts and caption state."""

from __future__ import annotations

import json

from origins.infrastructure.postgres.session import read_only, transaction
from origins.infrastructure.postgres.spend import today_provider_spend


TRANSCRIPT_FIELDS = (
    "name", "source_url", "audio_url", "language", "duration_ms", "text",
    "srt", "vtt", "part_id", "clip_id", "translated_from", "source_job_id",
    "model", "provider_region", "price_version", "catalog_rate",
    "catalog_cost", "cost_basis", "timing_source", "sentences", "workspace_id",
)


def insert_transcript(cursor, values: dict) -> int:
    """Insert through one field contract, including inside a caller transaction."""
    payload = [json.dumps(values.get(field, [])) if field == "sentences"
               else values.get(field) for field in TRANSCRIPT_FIELDS]
    cursor.execute(
        f"INSERT INTO transcripts ({', '.join(TRANSCRIPT_FIELDS)}) "
        f"VALUES ({', '.join(['%s'] * len(TRANSCRIPT_FIELDS))}) RETURNING id",
        payload,
    )
    return int(cursor.fetchone()[0])


class TranscriptRepository:
    """One owner for transcript reads, writes and generation caption state."""

    def save(self, values: dict) -> int:
        with transaction() as cursor:
            return insert_transcript(cursor, values)

    def get(self, transcript_id: int) -> dict | None:
        with read_only() as cursor:
            cursor.execute(
                f"SELECT transcript.id, transcript.public_id, transcript.created_at, "
                f"{', '.join('transcript.' + field for field in TRANSCRIPT_FIELDS)}, "
                "job.public_id FROM transcripts transcript "
                "LEFT JOIN jobs job ON job.id = transcript.source_job_id "
                "WHERE transcript.id = %s",
                (transcript_id,),
            )
            row = cursor.fetchone()
        if not row:
            return None
        keys = (("id", "public_id", "created_at") + TRANSCRIPT_FIELDS
                + ("source_job_public_id",))
        data = dict(zip(keys, row))
        data["public_id"] = str(data["public_id"])
        data["source_job_public_id"] = (
            str(data["source_job_public_id"])
            if data["source_job_public_id"] else None)
        data["created_at"] = data["created_at"].isoformat()
        return data

    def list(self, workspace_id: int, limit: int = 40) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT transcript.id, transcript.public_id,
                       transcript.created_at, transcript.name,
                       transcript.duration_ms,
                       jsonb_array_length(transcript.sentences),
                       transcript.model, transcript.provider_region,
                       transcript.catalog_cost, transcript.cost_basis,
                       job.public_id, transcript.timing_source
                 FROM transcripts transcript
                  LEFT JOIN jobs job ON job.id = transcript.source_job_id
                 WHERE transcript.workspace_id = %s
                 ORDER BY transcript.created_at DESC LIMIT %s
            """, (workspace_id, limit))
            rows = cursor.fetchall()
        return [{
            "id": row[0], "public_id": str(row[1]),
            "when": row[2].strftime("%b %d, %H:%M"), "name": row[3],
            "duration_ms": row[4], "lines": row[5], "model": row[6],
            "provider_region": row[7], "cost": float(row[8] or 0),
            "cost_basis": row[9],
            "source_job_id": str(row[10]) if row[10] else None,
            "timing_source": row[11],
        } for row in rows]

    def delete(self, transcript_id: int) -> bool:
        with transaction() as cursor:
            cursor.execute("DELETE FROM transcripts WHERE id = %s RETURNING id",
                           (transcript_id,))
            return cursor.fetchone() is not None

    def list_for_part(self, part_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, name, language, duration_ms, translated_from, stale
                  FROM transcripts WHERE part_id = %s
                 ORDER BY stale, created_at DESC
            """, (part_id,))
            rows = cursor.fetchall()
        return [{"id": ident, "name": name, "language": language,
                 "duration_ms": duration_ms,
                 "is_translation": parent is not None, "stale": stale}
                for ident, name, language, duration_ms, parent, stale in rows]

    def source_for_part(self, part_id: int) -> dict | None:
        """Newest source-language transcript used by Production rendering."""
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, duration_ms, sentences, stale
                  FROM transcripts
                 WHERE part_id = %s AND translated_from IS NULL
                 ORDER BY created_at DESC LIMIT 1
            """, (part_id,))
            row = cursor.fetchone()
        return (dict(zip(("id", "duration_ms", "sentences", "stale"), row))
                if row else None)

    def mark_stale(self, part_id: int) -> int:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE transcripts SET stale = true
                 WHERE part_id = %s AND stale = false
            """, (part_id,))
            return cursor.rowcount

    def part_source(self, part_id: int,
                    production_id: int | None = None) -> dict | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT part.id, clip.id, clip.filename, clip.path,
                       coalesce(clip.duration_ms, part.duration_ms)
                  FROM production_parts part
                  JOIN clips clip ON clip.part_id = part.id
                 WHERE part.id = %s AND part.archived_at IS NULL
                   AND (%s::bigint IS NULL OR part.production_id = %s)
            """, (part_id, production_id, production_id))
            row = cursor.fetchone()
        return (dict(zip(("id", "clip_id", "filename", "path", "duration_ms"), row))
                if row else None)

    def finish_part(self, part_id: int, clip_id: int | None,
                    duration_ms: int, transcript_id: int) -> None:
        """Make one caption set current without rewriting the immutable Clip."""
        with transaction() as cursor:
            cursor.execute("""
                DELETE FROM transcripts
                 WHERE part_id = %s AND id <> %s
            """, (part_id, transcript_id))
            cursor.execute("UPDATE transcripts SET stale = false WHERE id = %s",
                           (transcript_id,))

    def today_spend(self) -> float:
        return today_provider_spend()
