"""PostgreSQL persistence for native subtitle translation."""

from __future__ import annotations

import json

from audio_studio.infrastructure.postgres.session import read_only, transaction


class PostgresTranslationRepository:
    def get_transcript(self, transcript_id: int) -> dict | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, name, source_url, audio_url, language, duration_ms,
                       text, srt, vtt, sentences, generation_id, translated_from
                  FROM transcripts WHERE id = %s
            """, (transcript_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return dict(zip((
                "id", "name", "source_url", "audio_url", "language",
                "duration_ms", "text", "srt", "vtt", "sentences",
                "generation_id", "translated_from",
            ), row))

    def save_translation(self, values: dict) -> int:
        fields = (
            "name", "source_url", "audio_url", "language", "duration_ms",
            "text", "srt", "vtt", "generation_id", "translated_from",
            "source_job_id", "model", "provider_region", "price_version",
            "catalog_rate", "catalog_cost", "cost_basis", "sentences",
        )
        payload = [json.dumps(values.get(field, [])) if field == "sentences"
                   else values.get(field) for field in fields]
        with transaction() as cursor:
            cursor.execute(
                f"INSERT INTO transcripts ({', '.join(fields)}) "
                f"VALUES ({', '.join(['%s'] * len(fields))}) RETURNING id",
                payload,
            )
            return int(cursor.fetchone()[0])

    def today_spend(self) -> float:
        with read_only() as cursor:
            cursor.execute("""
                SELECT coalesce(sum(cost) FILTER
                       (WHERE created_at::date = current_date), 0)
                  FROM jobs
            """)
            row = cursor.fetchone()
            return float(row[0] or 0) if row else 0.0
