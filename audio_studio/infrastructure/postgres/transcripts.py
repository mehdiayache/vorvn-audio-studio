"""Canonical PostgreSQL persistence for transcripts and caption state."""

from __future__ import annotations

import json

from audio_studio.infrastructure.postgres.session import read_only, transaction


TRANSCRIPT_FIELDS = (
    "name", "source_url", "audio_url", "language", "duration_ms", "text",
    "srt", "vtt", "generation_id", "translated_from", "source_job_id",
    "model", "provider_region", "price_version", "catalog_rate",
    "catalog_cost", "cost_basis", "sentences",
)


class TranscriptRepository:
    """One owner for transcript reads, writes and generation caption state."""

    def save(self, values: dict) -> int:
        payload = [json.dumps(values.get(field, [])) if field == "sentences"
                   else values.get(field) for field in TRANSCRIPT_FIELDS]
        with transaction() as cursor:
            cursor.execute(
                f"INSERT INTO transcripts ({', '.join(TRANSCRIPT_FIELDS)}) "
                f"VALUES ({', '.join(['%s'] * len(TRANSCRIPT_FIELDS))}) RETURNING id",
                payload,
            )
            return int(cursor.fetchone()[0])

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

    def list(self, limit: int = 40) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT transcript.id, transcript.public_id,
                       transcript.created_at, transcript.name,
                       transcript.duration_ms,
                       jsonb_array_length(transcript.sentences),
                       transcript.model, transcript.provider_region,
                       transcript.catalog_cost, transcript.cost_basis,
                       job.public_id
                  FROM transcripts transcript
                  LEFT JOIN jobs job ON job.id = transcript.source_job_id
                 ORDER BY transcript.created_at DESC LIMIT %s
            """, (limit,))
            rows = cursor.fetchall()
        return [{
            "id": row[0], "public_id": str(row[1]),
            "when": row[2].strftime("%b %d, %H:%M"), "name": row[3],
            "duration_ms": row[4], "lines": row[5], "model": row[6],
            "provider_region": row[7], "cost": float(row[8] or 0),
            "cost_basis": row[9],
            "source_job_id": str(row[10]) if row[10] else None,
        } for row in rows]

    def delete(self, transcript_id: int) -> bool:
        with transaction() as cursor:
            cursor.execute("DELETE FROM transcripts WHERE id = %s RETURNING id",
                           (transcript_id,))
            return cursor.fetchone() is not None

    def list_for_generation(self, generation_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, name, language, duration_ms, translated_from, stale
                  FROM transcripts WHERE generation_id = %s ORDER BY created_at
            """, (generation_id,))
            rows = cursor.fetchall()
        return [{"id": ident, "name": name, "language": language,
                 "duration_ms": duration_ms,
                 "is_translation": parent is not None, "stale": stale}
                for ident, name, language, duration_ms, parent, stale in rows]

    def mark_stale(self, generation_id: int) -> int:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE transcripts SET stale = true
                 WHERE generation_id = %s AND stale = false
            """, (generation_id,))
            return cursor.rowcount

    def generation_source(self, generation_id: int,
                          production_id: int | None = None) -> dict | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT generation.id, generation.filename, generation.path,
                       generation.duration_ms
                  FROM generations generation
                  JOIN production_parts part
                    ON part.generation_id = generation.id
                 WHERE generation.id = %s
                   AND (%s::bigint IS NULL OR part.production_id = %s)
            """, (generation_id, production_id, production_id))
            row = cursor.fetchone()
        return (dict(zip(("id", "filename", "path", "duration_ms"), row))
                if row else None)

    def finish_generation(self, generation_id: int, duration_ms: int,
                          transcript_id: int) -> None:
        """Trust ASR duration and replace only captions known to be stale."""
        with transaction() as cursor:
            if duration_ms > 0:
                cursor.execute("UPDATE generations SET duration_ms = %s WHERE id = %s",
                               (duration_ms, generation_id))
            cursor.execute("""
                DELETE FROM transcripts
                 WHERE generation_id = %s AND stale = true AND id <> %s
            """, (generation_id, transcript_id))
            cursor.execute("UPDATE transcripts SET stale = false WHERE id = %s",
                           (transcript_id,))

    def today_spend(self) -> float:
        with read_only() as cursor:
            cursor.execute("""
                SELECT coalesce(sum(cost) FILTER
                       (WHERE created_at::date = current_date), 0)
                  FROM jobs
            """)
            row = cursor.fetchone()
            return float(row[0] or 0) if row else 0.0
