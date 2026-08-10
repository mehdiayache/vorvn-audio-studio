"""PostgreSQL persistence for one editable Production document."""

from __future__ import annotations

import json
from typing import Any

from audio_studio.infrastructure.postgres.session import read_only, transaction


MUSIC_LEVELS = {"discreet": 0.10, "present": 0.20, "loud": 0.34}

GENERATION_FIELDS = (
    "text", "text_raw", "text_shaped", "text_tagged", "text_state",
    "voice", "voice_identity_id", "engine", "model", "format", "language",
    "instruction", "rate", "pitch", "volume", "seed", "filename", "path",
    "size_bytes", "chars", "requests", "cost", "project_id", "position",
    "kind", "title", "duration_ms", "asset_of", "asset_id",
    "asset_version_id", "speech_mode", "usage", "cost_basis",
    "provider_text", "fidelity", "failures",
)

PART_FIELDS = (
    "id", "created_at", "position", "kind", "title", "text", "text_raw",
    "text_shaped", "text_tagged", "text_state", "voice",
    "voice_identity_id", "engine", "model", "format", "language",
    "instruction", "rate", "pitch", "volume", "seed", "filename",
    "size_bytes", "chars", "cost", "duration_ms", "asset_of", "asset_id",
    "asset_version_id", "speech_mode", "cost_basis", "provider_text",
    "fidelity",
)

TAKE_FIELDS = (
    "text", "text_raw", "text_shaped", "text_tagged", "text_state",
    "voice", "voice_identity_id", "engine", "model", "format", "language",
    "instruction", "rate", "pitch", "volume", "seed", "filename", "path",
    "size_bytes", "chars", "requests", "cost", "kind", "title",
    "duration_ms", "speech_mode", "usage", "cost_basis", "provider_text",
    "fidelity", "asset_of", "asset_id", "asset_version_id",
)


class ProductionDocumentRepository:
    """Own ordered Parts, historical Takes and background-music state."""

    @staticmethod
    def _legacy_id(cursor, production_id: int, *, lock: bool = False) -> int | None:
        cursor.execute(
            "SELECT legacy_container_id FROM productions "
            "WHERE id = %s AND archived_at IS NULL" + (" FOR UPDATE" if lock else ""),
            (production_id,),
        )
        row = cursor.fetchone()
        return int(row[0]) if row else None

    @staticmethod
    def _identity(cursor, voice: str, engine: str, model: str) -> str | None:
        if not voice or voice == "-":
            return None
        cursor.execute("""
            SELECT identity_id FROM voice_bindings
             WHERE provider_voice_id = %s
             ORDER BY (engine = %s) DESC, (model_id = %s) DESC, created_at DESC
             LIMIT 1
        """, (voice, engine, model))
        row = cursor.fetchone()
        return str(row[0]) if row else None

    def generation(self, generation_id: int) -> dict[str, Any] | None:
        columns = ("id", "created_at") + GENERATION_FIELDS
        with read_only() as cursor:
            cursor.execute(
                f"SELECT {', '.join(columns)} FROM generations WHERE id = %s",
                (generation_id,),
            )
            row = cursor.fetchone()
        if not row:
            return None
        result = dict(zip(columns, row))
        result["created_at"] = result["created_at"].isoformat()
        result["cost"] = float(result["cost"] or 0)
        return result

    def part(self, production_id: int, part_id: int) -> dict[str, Any] | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT generation.id, generation.kind, generation.filename,
                       generation.project_id, generation.position,
                       generation.title, generation.duration_ms
                  FROM production_parts part
                  JOIN generations generation ON generation.id = part.generation_id
                 WHERE part.production_id = %s AND part.generation_id = %s
            """, (production_id, part_id))
            row = cursor.fetchone()
        return (dict(zip(("id", "kind", "filename", "project_id", "position",
                          "title", "duration_ms"), row)) if row else None)

    def parts(self, production_id: int) -> list[dict[str, Any]]:
        """Return editor-ready Parts with caption and Take state in one query."""
        with read_only() as cursor:
            cursor.execute(f"""
                SELECT {', '.join('generation.' + field for field in PART_FIELDS)},
                       coalesce(takes.count, 0), coalesce(takes.cost, 0),
                       coalesce(version.filename, source.filename),
                       coalesce(version.duration_ms, source.duration_ms),
                       source.text, source.voice,
                       coalesce(captions.subtitled, false),
                       coalesce(captions.stale, false),
                       coalesce(captions.languages, ARRAY[]::text[])
                  FROM production_parts part
                  JOIN generations generation ON generation.id = part.generation_id
                  LEFT JOIN generations source ON source.id = generation.asset_of
                  LEFT JOIN asset_versions version ON version.id = generation.asset_version_id
                  LEFT JOIN LATERAL (
                    SELECT count(*) AS count, coalesce(sum(cost), 0) AS cost
                      FROM generations archived WHERE archived.version_of = generation.id
                  ) takes ON true
                  LEFT JOIN LATERAL (
                    SELECT bool_or(transcript.translated_from IS NULL) AS subtitled,
                           bool_or(transcript.stale AND transcript.translated_from IS NULL) AS stale,
                           array_agg(DISTINCT transcript.language)
                             FILTER (WHERE transcript.translated_from IS NOT NULL) AS languages
                      FROM transcripts transcript
                     WHERE transcript.generation_id = generation.id
                  ) captions ON true
                 WHERE part.production_id = %s
                 ORDER BY part.position NULLS LAST, generation.created_at, generation.id
            """, (production_id,))
            rows = cursor.fetchall()
        extra = ("takes", "takes_cost", "asset_filename", "asset_duration",
                 "asset_text", "asset_voice", "subtitled", "subtitles_stale",
                 "languages")
        result = []
        for row in rows:
            item = dict(zip(PART_FIELDS + extra, row))
            item["spent"] = float(item["cost"] or 0) + float(item.pop("takes_cost") or 0)
            if item["kind"] == "asset":
                item["missing"] = not item["asset_filename"]
                item["filename"] = item["asset_filename"] or ""
                item["duration_ms"] = item["asset_duration"] or item["duration_ms"]
                item["text"] = item["asset_text"] or item["text"]
                item["voice"] = item["asset_voice"] or item["voice"]
            for key in ("asset_filename", "asset_duration", "asset_text", "asset_voice"):
                item.pop(key, None)
            item["created_at"] = item["created_at"].isoformat()
            item["cost"] = float(item["cost"] or 0)
            item["takes"] = int(item["takes"] or 0)
            item["languages"] = sorted(set(item["languages"] or []))
            # Empty JSON is the persisted representation for generations that
            # never ran a script-fidelity check. Expose absence as None so an
            # empty object is not mistaken for a real fidelity result.
            item["fidelity"] = item["fidelity"] or None
            result.append(item)
        return result

    def next_position(self, production_id: int) -> int:
        with read_only() as cursor:
            cursor.execute("""
                SELECT coalesce(max(position), -1) + 1
                  FROM production_parts WHERE production_id = %s
            """, (production_id,))
            return int(cursor.fetchone()[0])

    def create_part(self, production_id: int, values: dict[str, Any],
                    insert_at: int | None = None) -> int | None:
        defaults = {
            "text": "", "voice": "-", "engine": "none", "model": "-",
            "format": "mp3", "rate": 1, "pitch": 1, "volume": 50,
            "seed": 0, "filename": "", "path": "", "size_bytes": 0,
            "chars": 0, "requests": 0, "cost": 0, "kind": "audio",
            "usage": {}, "fidelity": {}, "failures": [],
        }
        payload = {**defaults, **values}
        with transaction() as cursor:
            legacy_id = self._legacy_id(cursor, production_id, lock=True)
            if legacy_id is None:
                return None
            position = (int(insert_at) if insert_at is not None else
                        self._next_position(cursor, production_id))
            if insert_at is not None:
                cursor.execute("""
                    UPDATE generations SET position = position + 1
                     WHERE production_id = %s AND version_of IS NULL
                       AND position >= %s
                """, (production_id, position))
            payload["project_id"] = legacy_id
            payload["position"] = position
            if not payload.get("voice_identity_id"):
                payload["voice_identity_id"] = self._identity(
                    cursor, str(payload.get("voice") or ""),
                    str(payload.get("engine") or ""),
                    str(payload.get("model") or ""))
            serialized = [json.dumps(payload.get(field, {}))
                          if field in {"usage", "fidelity", "failures"}
                          else payload.get(field) for field in GENERATION_FIELDS]
            cursor.execute(
                f"INSERT INTO generations ({', '.join(GENERATION_FIELDS)}) "
                f"VALUES ({', '.join(['%s'] * len(GENERATION_FIELDS))}) RETURNING id",
                serialized,
            )
            return int(cursor.fetchone()[0])

    @staticmethod
    def _next_position(cursor, production_id: int) -> int:
        cursor.execute("""
            SELECT coalesce(max(position), -1) + 1
              FROM production_parts WHERE production_id = %s
        """, (production_id,))
        return int(cursor.fetchone()[0])

    def insert_asset(self, production_id: int, asset_id: int,
                     insert_at: int | None = None) -> int | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT source.text, source.voice, source.engine, source.model,
                       source.format, source.language, source.instruction,
                       source.rate, source.pitch, source.volume, source.seed,
                       version.size_bytes, version.duration_ms, source.title,
                       asset.legacy_generation_id, asset.id, version.id
                  FROM assets asset
                  JOIN productions production ON production.id = %s
                  JOIN work_projects project ON project.id = production.project_id
                  JOIN generations source ON source.id = asset.legacy_generation_id
                  JOIN LATERAL (
                    SELECT item.* FROM asset_versions item
                     WHERE item.asset_id = asset.id
                     ORDER BY item.version DESC LIMIT 1
                  ) version ON true
                 WHERE asset.id = %s AND asset.venture_id = project.venture_id
                   AND asset.kind IN ('intros', 'outros', 'stingers')
            """, (production_id, asset_id))
            row = cursor.fetchone()
        if not row:
            return None
        (text, voice, engine, model, audio_format, language, instruction, rate,
         pitch, volume, seed, size_bytes, duration_ms, title, source_id,
         stable_asset_id, version_id) = row
        return self.create_part(production_id, {
            "text": text, "voice": voice, "engine": engine, "model": model,
            "format": audio_format, "language": language,
            "instruction": instruction, "rate": rate, "pitch": pitch,
            "volume": volume, "seed": seed, "filename": "", "path": "",
            "size_bytes": size_bytes, "duration_ms": duration_ms, "chars": 0,
            "requests": 0, "cost": 0, "kind": "asset", "title": title or "",
            "asset_of": source_id, "asset_id": stable_asset_id,
            "asset_version_id": version_id, "cost_basis": "not billed",
        }, insert_at)

    def music(self, production_id: int) -> dict[str, Any]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT mix.music_asset_id, mix.level, mix.fade_in_seconds,
                       mix.fade_out_seconds, mix.duck, mix.volume,
                       mix.start_seconds, version.filename, asset.name,
                       version.duration_ms
                  FROM production_mixes mix
                  LEFT JOIN assets asset ON asset.id = mix.music_asset_id
                  LEFT JOIN LATERAL (
                    SELECT item.* FROM asset_versions item
                     WHERE item.asset_id = asset.id
                     ORDER BY item.version DESC LIMIT 1
                  ) version ON true
                 WHERE mix.production_id = %s
            """, (production_id,))
            row = cursor.fetchone()
        if not row:
            return {}
        return {
            "music_of": row[0], "level": row[1] or "discreet",
            "fade_in": float(row[2] or 0), "fade_out": float(row[3] or 0),
            "duck": bool(row[4]), "volume": float(row[5] or 0),
            "start": float(row[6] or 0), "filename": row[7] or "",
            "name": (row[8] or "")[:80], "duration_ms": row[9],
        }

    def set_music(self, production_id: int, values: dict[str, Any]) -> bool:
        aliases = {
            "music_of": "music_asset_id", "music_level": "level",
            "music_fade_in": "fade_in_seconds",
            "music_fade_out": "fade_out_seconds", "music_duck": "duck",
            "music_volume": "volume", "music_start": "start_seconds",
        }
        provided = {aliases[key]: value for key, value in values.items()
                    if key in aliases}
        if not provided:
            return False
        if "volume" in provided:
            provided["volume"] = max(0.0, min(1.0, float(provided["volume"])))
        if "start_seconds" in provided:
            provided["start_seconds"] = max(0.0, float(provided["start_seconds"]))
        with transaction() as cursor:
            legacy_id = self._legacy_id(cursor, production_id, lock=True)
            if legacy_id is None:
                return False
            cursor.execute("""
                SELECT music_asset_id, level, volume, start_seconds,
                       fade_in_seconds, fade_out_seconds, duck
                  FROM production_mixes WHERE production_id = %s FOR UPDATE
            """, (production_id,))
            current = cursor.fetchone() or (None, "discreet", .10, 0, 2, 4, True)
            state = dict(zip(("music_asset_id", "level", "volume", "start_seconds",
                              "fade_in_seconds", "fade_out_seconds", "duck"), current))
            state.update(provided)
            asset_id = state["music_asset_id"]
            legacy_music_id = None
            if asset_id not in (None, "", 0, "0"):
                cursor.execute("""
                    SELECT asset.legacy_generation_id
                      FROM assets asset
                      JOIN productions production ON production.id = %s
                      JOIN work_projects project ON project.id = production.project_id
                     WHERE asset.id = %s AND asset.kind = 'music'
                       AND asset.venture_id = project.venture_id
                """, (production_id, int(asset_id)))
                asset = cursor.fetchone()
                if not asset:
                    return False
                state["music_asset_id"] = int(asset_id)
                legacy_music_id = asset[0]
            else:
                state["music_asset_id"] = None
            cursor.execute("""
                INSERT INTO production_mixes
                    (production_id, music_asset_id, level, volume, start_seconds,
                     fade_in_seconds, fade_out_seconds, duck, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (production_id) DO UPDATE SET
                    music_asset_id = EXCLUDED.music_asset_id,
                    level = EXCLUDED.level, volume = EXCLUDED.volume,
                    start_seconds = EXCLUDED.start_seconds,
                    fade_in_seconds = EXCLUDED.fade_in_seconds,
                    fade_out_seconds = EXCLUDED.fade_out_seconds,
                    duck = EXCLUDED.duck, updated_at = now()
            """, (production_id, state["music_asset_id"], state["level"],
                  state["volume"], state["start_seconds"], state["fade_in_seconds"],
                  state["fade_out_seconds"], state["duck"]))
            cursor.execute("""
                UPDATE projects SET music_of = %s, music_level = %s,
                       music_volume = %s, music_start = %s,
                       music_fade_in = %s, music_fade_out = %s,
                       music_duck = %s, updated_at = now()
                 WHERE id = %s
            """, (legacy_music_id, state["level"], state["volume"],
                  state["start_seconds"], state["fade_in_seconds"],
                  state["fade_out_seconds"], state["duck"], legacy_id))
            return True

    def reorder(self, production_id: int, ordered_ids: list[int]) -> bool:
        ordered_ids = [int(item) for item in ordered_ids]
        if len(ordered_ids) != len(set(ordered_ids)):
            return False
        with transaction() as cursor:
            legacy_id = self._legacy_id(cursor, production_id, lock=True)
            if legacy_id is None:
                return False
            cursor.execute("""
                SELECT generation_id FROM production_parts
                 WHERE production_id = %s FOR UPDATE
                 ORDER BY position NULLS LAST, created_at, generation_id
            """, (production_id,))
            current = [int(row[0]) for row in cursor.fetchall()]
            owned = set(current)
            if any(item not in owned for item in ordered_ids):
                return False
            final_order = ordered_ids + [item for item in current
                                         if item not in set(ordered_ids)]
            for position, generation_id in enumerate(final_order):
                cursor.execute("""
                    UPDATE generations SET position = %s WHERE id = %s
                """, (position, generation_id))
            cursor.execute("UPDATE projects SET updated_at = now() WHERE id = %s",
                           (legacy_id,))
            return True

    def update_part(self, production_id: int, part_id: int,
                    values: dict[str, Any]) -> bool:
        allowed = {key: values[key] for key in (
            "title", "text", "text_raw", "text_shaped", "text_tagged",
            "text_state", "duration_ms") if key in values}
        if not allowed:
            return False
        with transaction() as cursor:
            cursor.execute("""
                UPDATE generations generation
                   SET """ + ", ".join(f"{key} = %s" for key in allowed) + """,
                       created_at = now()
                  FROM production_parts part
                 WHERE generation.id = %s AND part.generation_id = generation.id
                   AND part.production_id = %s
                RETURNING generation.id
            """, (*allowed.values(), part_id, production_id))
            return cursor.fetchone() is not None

    def duplicate(self, production_id: int, part_id: int,
                  filename: str = "") -> int | None:
        with transaction() as cursor:
            cursor.execute("""
                SELECT generation.project_id, generation.position
                  FROM generations generation
                  JOIN production_parts part ON part.generation_id = generation.id
                 WHERE part.production_id = %s AND generation.id = %s FOR UPDATE
            """, (production_id, part_id))
            row = cursor.fetchone()
            if not row:
                return None
            project_id, position = row[0], int(row[1] or 0)
            cursor.execute("""
                UPDATE generations SET position = position + 1
                 WHERE production_id = %s AND version_of IS NULL AND position > %s
            """, (production_id, position))
            columns = tuple(field for field in TAKE_FIELDS
                            if field not in {"filename", "cost"}) + ("failures",)
            cursor.execute(
                f"INSERT INTO generations ({', '.join(columns)}, project_id, filename, position, cost) "
                f"SELECT {', '.join(columns)}, %s, %s, %s, 0 "
                f"FROM generations WHERE id = %s RETURNING id",
                (project_id, filename or "", position + 1, part_id),
            )
            return int(cursor.fetchone()[0])

    @staticmethod
    def _recover_spend(cursor, ids: list[int]) -> None:
        for part_id in ids:
            cursor.execute("""
                SELECT root.project_id, root.voice, root.voice_identity_id,
                       root.engine, root.model, min(all_takes.created_at),
                       coalesce(sum(all_takes.cost), 0),
                       coalesce((SELECT sum(job.cost) FROM jobs job
                                  WHERE job.kind = 'speech' AND
                                    (job.generation_id = root.id OR job.generation_id IN (
                                      SELECT id FROM generations WHERE version_of = root.id))), 0)
                  FROM generations root
                  JOIN generations all_takes
                    ON all_takes.id = root.id OR all_takes.version_of = root.id
                 WHERE root.id = %s GROUP BY root.id
            """, (part_id,))
            row = cursor.fetchone()
            if not row:
                continue
            (project_id, voice, identity_id, engine, model, created_at,
             content_cost, tracked_cost) = row
            gap = round(max(0.0, float(content_cost) - float(tracked_cost)), 6)
            if gap <= 0:
                continue
            tier = "flash" if "flash" in str(model or "") else "plus"
            cursor.execute("""
                INSERT INTO jobs
                    (created_at, kind, model, status, estimated, cost, project_id,
                     generation_id, voice, voice_identity_id, provider_voice_id,
                     engine, tier, detail, cost_basis)
                VALUES (%s, 'speech', %s, 'ok', %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, 'Recovered pre-ledger Part spend before deletion',
                        'historical_generation')
            """, (created_at, model, gap, gap, project_id, part_id, voice,
                  identity_id, voice, engine, tier))

    def delete(self, production_id: int, ids: list[int]) -> list[str] | None:
        ids = [int(item) for item in ids]
        if not ids:
            return []
        with transaction() as cursor:
            cursor.execute("""
                SELECT generation_id FROM production_parts
                 WHERE production_id = %s AND generation_id = ANY(%s) FOR UPDATE
            """, (production_id, ids))
            owned = {int(row[0]) for row in cursor.fetchall()}
            if owned != set(ids):
                return None
            self._recover_spend(cursor, ids)
            cursor.execute("""
                SELECT filename FROM generations
                 WHERE id = ANY(%s) OR version_of = ANY(%s)
            """, (ids, ids))
            files = [row[0] for row in cursor.fetchall() if row[0]]
            cursor.execute("""
                DELETE FROM generations WHERE id = ANY(%s) OR version_of = ANY(%s)
            """, (ids, ids))
            cursor.execute("""
                WITH ranked AS (
                    SELECT generation_id,
                           row_number() OVER (ORDER BY position, created_at,
                                                       generation_id) - 1 AS next_position
                      FROM production_parts WHERE production_id = %s
                )
                UPDATE generations generation SET position = ranked.next_position
                  FROM ranked WHERE generation.id = ranked.generation_id
                    AND generation.position <> ranked.next_position
            """, (production_id,))
            return list(dict.fromkeys(files))

    def move(self, source_production_id: int, ids: list[int],
             destination_production_id: int) -> bool:
        ids = [int(item) for item in ids]
        if not ids:
            return False
        with transaction() as cursor:
            destination_legacy = self._legacy_id(
                cursor, destination_production_id, lock=True)
            if destination_legacy is None:
                return False
            cursor.execute("""
                SELECT generation_id FROM production_parts
                 WHERE production_id = %s AND generation_id = ANY(%s) FOR UPDATE
            """, (source_production_id, ids))
            if {int(row[0]) for row in cursor.fetchall()} != set(ids):
                return False
            start = self._next_position(cursor, destination_production_id)
            for offset, part_id in enumerate(ids):
                cursor.execute("""
                    UPDATE generations SET project_id = %s, position = %s WHERE id = %s
                """, (destination_legacy, start + offset, part_id))
                cursor.execute("""
                    UPDATE generations SET project_id = %s WHERE version_of = %s
                """, (destination_legacy, part_id))
            cursor.execute("""
                WITH ranked AS (
                    SELECT generation_id,
                           row_number() OVER (ORDER BY position, created_at,
                                                       generation_id) - 1 AS next_position
                      FROM production_parts WHERE production_id = %s
                )
                UPDATE generations generation SET position = ranked.next_position
                  FROM ranked WHERE generation.id = ranked.generation_id
                    AND generation.position <> ranked.next_position
            """, (source_production_id,))
            return True

    def takes(self, production_id: int, part_id: int) -> list[dict[str, Any]] | None:
        if not self.part(production_id, part_id):
            return None
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, created_at, voice, voice_identity_id, engine, model, rate,
                       pitch, seed, filename, size_bytes, cost, text, duration_ms,
                       instruction, language, fidelity
                  FROM generations WHERE version_of = %s ORDER BY created_at DESC
            """, (part_id,))
            rows = cursor.fetchall()
        return [{
            "id": row[0], "when": row[1].isoformat(), "voice": row[2],
            "voice_identity_id": row[3], "engine": row[4], "model": row[5],
            "rate": float(row[6]), "pitch": float(row[7]), "seed": row[8],
            "filename": row[9], "size_bytes": row[10], "cost": float(row[11]),
            "text": row[12], "duration_ms": row[13], "instruction": row[14],
            "language": row[15], "fidelity": row[16] or None,
        } for row in rows]

    def promote(self, production_id: int, part_id: int, take_id: int) -> bool:
        columns = ", ".join(TAKE_FIELDS)
        assignments = ", ".join(f"{field} = %s" for field in TAKE_FIELDS)
        with transaction() as cursor:
            cursor.execute("""
                SELECT archived.version_of
                  FROM generations archived
                  JOIN production_parts part ON part.generation_id = archived.version_of
                 WHERE archived.id = %s AND archived.version_of = %s
                   AND part.production_id = %s FOR UPDATE
            """, (take_id, part_id, production_id))
            if not cursor.fetchone():
                return False
            cursor.execute(f"SELECT {columns} FROM generations WHERE id = %s",
                           (part_id,))
            current = cursor.fetchone()
            cursor.execute(f"SELECT {columns} FROM generations WHERE id = %s",
                           (take_id,))
            chosen = cursor.fetchone()
            if not current or not chosen:
                return False
            current_values = [json.dumps(value or {})
                              if field in {"usage", "fidelity"} else value
                              for field, value in zip(TAKE_FIELDS, current)]
            chosen_values = [json.dumps(value or {})
                             if field in {"usage", "fidelity"} else value
                             for field, value in zip(TAKE_FIELDS, chosen)]
            cursor.execute(f"UPDATE generations SET {assignments} WHERE id = %s",
                           (*chosen_values, part_id))
            cursor.execute(f"UPDATE generations SET {assignments} WHERE id = %s",
                           (*current_values, take_id))
            return True

    def save_text(self, production_id: int, part_id: int,
                  values: dict[str, Any]) -> bool:
        if values.get("text") is None:
            values = {key: value for key, value in values.items()
                      if key != "text"}
        return self.update_part(production_id, part_id, values)
