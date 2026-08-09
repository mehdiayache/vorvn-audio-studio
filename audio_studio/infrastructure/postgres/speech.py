"""PostgreSQL reads shared by native speech-producing capabilities."""

from __future__ import annotations

import json
from typing import Any

from audio_studio.infrastructure.postgres.session import read_only, transaction
from services.alibaba import voice_registry


_PART_KEYS = (
    "id", "created_at", "kind", "title", "text", "text_raw",
    "text_shaped", "text_tagged", "text_state", "voice",
    "voice_identity_id", "engine", "model", "format", "language",
    "instruction", "speech_mode", "rate", "pitch", "volume", "seed",
    "filename", "path", "size_bytes", "duration_ms", "chars", "requests",
    "cost", "usage", "cost_basis", "provider_text", "fidelity",
    "failures", "legacy_project_id", "production_id", "position",
)
_PART_SELECT = """
    SELECT generation.id, generation.created_at, generation.kind,
           generation.title, generation.text, generation.text_raw,
           generation.text_shaped, generation.text_tagged,
           generation.text_state, generation.voice,
           generation.voice_identity_id, generation.engine, generation.model,
           generation.format, generation.language, generation.instruction,
           generation.speech_mode, generation.rate, generation.pitch,
           generation.volume, generation.seed, generation.filename,
           generation.path, generation.size_bytes, generation.duration_ms,
           generation.chars, generation.requests, generation.cost,
           generation.usage, generation.cost_basis, generation.provider_text,
           generation.fidelity, generation.failures, generation.project_id,
           generation.production_id, generation.position
      FROM generations generation
"""
_WRITE_FIELDS = (
    "text", "text_raw", "text_shaped", "text_tagged", "text_state",
    "voice", "voice_identity_id", "engine", "model", "format", "language",
    "instruction", "speech_mode", "rate", "pitch", "volume", "seed",
    "filename", "path", "size_bytes", "duration_ms", "chars", "requests",
    "cost", "kind", "title", "usage", "cost_basis", "provider_text",
    "fidelity", "failures",
)
_ARCHIVE_FIELDS = (
    "text", "text_raw", "text_shaped", "text_tagged", "text_state",
    "voice", "voice_identity_id", "engine", "model", "format", "language",
    "instruction", "rate", "pitch", "volume", "seed", "filename", "path",
    "size_bytes", "chars", "requests", "cost", "kind", "title",
    "duration_ms", "speech_mode", "usage", "cost_basis", "provider_text",
    "fidelity", "asset_of", "asset_id", "asset_version_id",
)


def _json_value(field: str, value):
    return json.dumps(value or ([] if field == "failures" else {})) \
        if field in {"usage", "fidelity", "failures"} else value


def _part(row) -> dict[str, Any] | None:
    if not row:
        return None
    result = dict(zip(_PART_KEYS, row))
    result["cost"] = float(result.get("cost") or 0)
    result["rate"] = float(result.get("rate") or 1)
    result["pitch"] = float(result.get("pitch") or 1)
    return result


class SpeechRepository:
    def voice_bindings(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT binding.provider_voice_id, binding.model_id,
                       binding.engine, binding.tier, binding.status,
                       binding.languages, identity.id, identity.name
                  FROM voice_bindings binding
                  JOIN voice_identities identity
                    ON identity.id = binding.identity_id
                 WHERE binding.source = 'custom'
                   AND identity.status = 'active'
                   AND binding.status NOT IN
                       ('deleted', 'undeployed', 'failed', 'archived')
                 ORDER BY identity.name, binding.model_id
            """)
            custom = [{
                "provider_voice_id": row[0], "voice_id": row[0],
                "model_id": row[1], "target_model": row[1],
                "engine": row[2], "tier": row[3], "status": row[4],
                "languages": row[5] or [], "identity_id": row[6],
                "name": row[7], "source": "custom", "provider": "alibaba",
            } for row in cursor.fetchall()]
        return [*voice_registry.system_bindings(), *custom]

    def pronunciations(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, pattern, replacement, whole_word, match_case,
                       enabled, phoneme
                  FROM pronunciations
                 WHERE enabled
                 ORDER BY length(pattern) DESC, id
            """)
            keys = ("id", "pattern", "replacement", "whole_word",
                    "match_case", "enabled", "phoneme")
            return [dict(zip(keys, row)) for row in cursor.fetchall()]

    def today_spend(self) -> float:
        with read_only() as cursor:
            cursor.execute("""
                SELECT coalesce(sum(cost) FILTER
                       (WHERE created_at::date = current_date), 0)
                  FROM jobs
            """)
            row = cursor.fetchone()
            return float(row[0] or 0) if row else 0.0

    def production(self, production_id: int) -> dict[str, Any] | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT production.id, production.legacy_container_id,
                       production.name, production.settings
                  FROM productions production
                  JOIN work_projects project ON project.id = production.project_id
                  JOIN ventures venture ON venture.id = project.venture_id
                 WHERE production.id = %s
                   AND production.archived_at IS NULL
                   AND project.archived_at IS NULL
                   AND venture.archived_at IS NULL
            """, (production_id,))
            row = cursor.fetchone()
        return ({"id": row[0], "legacy_container_id": row[1], "name": row[2],
                 "settings": row[3] or {}}
                if row else None)

    def part(self, part_id: int, production_id: int) -> dict[str, Any] | None:
        with read_only() as cursor:
            cursor.execute(
                _PART_SELECT + """
                 WHERE generation.id = %s AND generation.production_id = %s
                   AND generation.version_of IS NULL
                """, (part_id, production_id))
            return _part(cursor.fetchone())

    def create_part(self, production_id: int | None, insert_at: int | None,
                    values: dict[str, Any]) -> int:
        with transaction() as cursor:
            if production_id is not None:
                cursor.execute("""
                    SELECT legacy_container_id FROM productions
                     WHERE id = %s AND archived_at IS NULL FOR UPDATE
                """, (production_id,))
                owner = cursor.fetchone()
                if not owner:
                    raise LookupError("That Production no longer exists.")
                legacy_id = int(owner[0])
                cursor.execute("""
                    SELECT coalesce(max(position), -1) + 1
                      FROM generations
                     WHERE project_id = %s AND version_of IS NULL
                       AND kind <> 'stitch'
                """, (legacy_id,))
                next_position = int(cursor.fetchone()[0] or 0)
                position = (next_position if insert_at is None else
                            max(0, min(int(insert_at), next_position)))
                if insert_at is not None:
                    cursor.execute("""
                        UPDATE generations SET position = position + 1
                         WHERE project_id = %s AND version_of IS NULL
                           AND position >= %s
                    """, (legacy_id, position))
            else:
                cursor.execute("""
                    SELECT id FROM projects WHERE system_role = 'inbox'
                     FOR UPDATE
                """)
                owner = cursor.fetchone()
                if owner:
                    legacy_id = int(owner[0])
                else:
                    cursor.execute("""
                        INSERT INTO projects
                            (name, level, locked, container_type, system_role)
                        VALUES ('Unsorted', 'venture', true, 'inbox', 'inbox')
                        RETURNING id
                    """)
                    legacy_id = int(cursor.fetchone()[0])
                position = None

            fields = (*_WRITE_FIELDS, "project_id", "position")
            row = {**values, "project_id": legacy_id, "position": position}
            cursor.execute(
                f"INSERT INTO generations ({', '.join(fields)}) "
                f"VALUES ({', '.join(['%s'] * len(fields))}) RETURNING id",
                [_json_value(field, row.get(field)) for field in fields],
            )
            created = cursor.fetchone()
            if not created:
                raise RuntimeError("The generated Part could not be saved.")
            return int(created[0])

    def replace_part(self, part_id: int, production_id: int,
                     expected_created_at, values: dict[str, Any], *,
                     operation: str) -> dict[str, int]:
        with transaction() as cursor:
            cursor.execute("""
                SELECT created_at, kind FROM generations
                 WHERE id = %s AND production_id = %s
                   AND version_of IS NULL FOR UPDATE
            """, (part_id, production_id))
            current = cursor.fetchone()
            if not current:
                raise LookupError("That Part no longer belongs to this Production.")
            if current[0] != expected_created_at:
                raise RuntimeError(
                    "That Part changed while the new audio was being generated. "
                    "The paid recording is preserved on disk; reload before deciding what to do.")
            kind = str(current[1] or "")
            if operation == "render_draft" and kind != "draft":
                raise ValueError("That Draft has already been recorded.")
            if operation == "regenerate" and kind not in {"audio", "speech"}:
                raise ValueError("Only recorded speech can receive another Take.")
            if operation == "regenerate":
                columns = ", ".join(_ARCHIVE_FIELDS)
                cursor.execute(
                    f"INSERT INTO generations ({columns}, project_id, "
                    f"version_of, failures) SELECT {columns}, project_id, %s, "
                    "failures FROM generations WHERE id = %s",
                    (part_id, part_id),
                )
            assignments = ", ".join(f"{field} = %s" for field in _WRITE_FIELDS)
            cursor.execute(
                f"UPDATE generations SET {assignments}, created_at = now() "
                "WHERE id = %s",
                [_json_value(field, values.get(field))
                 for field in _WRITE_FIELDS] + [part_id],
            )
            stale = 0
            if operation == "regenerate":
                cursor.execute("""
                    UPDATE transcripts SET stale = true
                     WHERE generation_id = %s AND stale = false
                """, (part_id,))
                stale = cursor.rowcount
            cursor.execute("SELECT count(*) FROM generations WHERE version_of = %s",
                           (part_id,))
            takes = int(cursor.fetchone()[0] or 0)
            return {"takes": takes, "subtitles_stale": stale}
