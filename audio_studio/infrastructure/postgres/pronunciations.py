"""Canonical PostgreSQL persistence for pronunciation rules."""

from __future__ import annotations

from audio_studio.infrastructure.postgres.session import read_only, transaction


_FIELDS = (
    "id", "pattern", "replacement", "whole_word", "match_case", "enabled",
    "phoneme",
)


class PronunciationRepository:
    def list(self, *, enabled_only: bool = False) -> list[dict]:
        where = "WHERE enabled" if enabled_only else ""
        with read_only() as cursor:
            cursor.execute(
                f"SELECT {', '.join(_FIELDS)} FROM pronunciations {where} "
                "ORDER BY length(pattern) DESC, id")
            return [dict(zip(_FIELDS, row)) for row in cursor.fetchall()]

    def save(self, entry: dict) -> int | None:
        fields = _FIELDS[1:]
        with transaction() as cursor:
            if entry.get("id"):
                cursor.execute(
                    f"UPDATE pronunciations SET "
                    f"{', '.join(field + ' = %s' for field in fields)} "
                    "WHERE id = %s RETURNING id",
                    [entry.get(field) for field in fields] + [entry["id"]])
            else:
                cursor.execute(
                    f"INSERT INTO pronunciations ({', '.join(fields)}) "
                    f"VALUES ({', '.join(['%s'] * len(fields))}) RETURNING id",
                    [entry.get(field) for field in fields])
            row = cursor.fetchone()
            return int(row[0]) if row else None

    def delete(self, entry_id: int) -> bool:
        with transaction() as cursor:
            cursor.execute(
                "DELETE FROM pronunciations WHERE id = %s RETURNING id",
                (entry_id,))
            return cursor.fetchone() is not None
