"""Canonical PostgreSQL persistence for an editable Production document.

Parts own editorial intent. Takes own generated performance. Provider settings
are exposed from the selected Take only as a temporary response compatibility
shape; they are never written back onto the Part.
"""

from __future__ import annotations

from hashlib import sha256
import json
from typing import Any

from audio_studio.infrastructure.postgres.session import read_only, transaction


MUSIC_LEVELS = {"discreet": 0.10, "present": 0.20, "loud": 0.34}


def script_hash(value: str) -> str:
    return sha256((value or "").encode()).hexdigest()


def _float(value, default: float = 0) -> float:
    return float(value if value is not None else default)


class ProductionDocumentRepository:
    """Own stable Parts, immutable Takes and background-music state."""

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
    def _part_row(cursor, production_id: int, part_id: int, *, lock=False):
        cursor.execute("""
            SELECT id, public_id, production_id, position, kind, script, title,
                   cast_role_id, editorial_status, revision, selected_take_id,
                   asset_id, asset_version_id, duration_ms, created_at, updated_at
              FROM production_parts
             WHERE id = %s AND production_id = %s AND archived_at IS NULL
        """ + (" FOR UPDATE" if lock else ""), (part_id, production_id))
        return cursor.fetchone()

    @staticmethod
    def _next_position(cursor, production_id: int) -> int:
        cursor.execute("""
            SELECT coalesce(max(position), -1) + 1
              FROM production_parts
             WHERE production_id = %s AND archived_at IS NULL
        """, (production_id,))
        return int(cursor.fetchone()[0])

    def generation(self, identifier: int) -> dict[str, Any] | None:
        """Compatibility read for callers not yet renamed to Part/Take."""
        with read_only() as cursor:
            cursor.execute("""
                SELECT part.id, part.created_at, part.position, part.kind,
                       part.title, part.script, part.revision, part.editorial_status,
                       take.snapshot, take.filename, take.path, take.size_bytes,
                       take.duration_ms, take.cost, take.language, take.usage,
                       take.cost_basis, take.diagnostics, take.voice_identity_id,
                       take.provider_voice_id, take.model_id, take.tier,
                       part.production_id
                  FROM production_parts part
                  LEFT JOIN takes take ON take.id = part.selected_take_id
                 WHERE part.id = %s AND part.archived_at IS NULL
            """, (identifier,))
            row = cursor.fetchone()
            if not row:
                cursor.execute("""
                    SELECT part.id, take.created_at, part.position, part.kind,
                           part.title, part.script, part.revision,
                           part.editorial_status, take.snapshot, take.filename,
                           take.path, take.size_bytes, take.duration_ms, take.cost,
                           take.language, take.usage, take.cost_basis,
                           take.diagnostics, take.voice_identity_id,
                           take.provider_voice_id, take.model_id, take.tier,
                           part.production_id
                      FROM takes take
                      JOIN production_parts part ON part.id = take.part_id
                     WHERE take.id = %s
                """, (identifier,))
                row = cursor.fetchone()
        if not row:
            return None
        snapshot = row[8] or {}
        return {
            "id": row[0], "created_at": row[1].isoformat(),
            "position": row[2], "kind": row[3], "title": row[4],
            "text": row[5], "revision": row[6],
            "editorial_status": row[7], "filename": row[9] or "",
            "path": row[10] or "", "size_bytes": int(row[11] or 0),
            "duration_ms": row[12], "cost": _float(row[13]),
            "language": row[14], "usage": row[15] or {},
            "cost_basis": row[16] or "unknown",
            "fidelity": (row[17] or {}).get("fidelity"),
            "failures": (row[17] or {}).get("failures", []),
            "voice_identity_id": row[18],
            "voice": row[19] or snapshot.get("voice") or "",
            "model": row[20] or snapshot.get("model") or "",
            "engine": snapshot.get("engine") or "",
            "format": snapshot.get("format") or "mp3",
            "instruction": snapshot.get("instruction") or "",
            "speech_mode": snapshot.get("speech_mode") or "exact",
            "rate": _float(snapshot.get("rate"), 1),
            "pitch": _float(snapshot.get("pitch"), 1),
            "volume": int(snapshot.get("volume") or 50),
            "seed": int(snapshot.get("seed") or 0),
            "production_id": row[22],
        }

    def part(self, production_id: int, part_id: int) -> dict[str, Any] | None:
        with read_only() as cursor:
            row = self._part_row(cursor, production_id, part_id)
            if not row:
                return None
            cursor.execute("""
                SELECT filename, provider_voice_id, voice_identity_id, snapshot,
                       voice_name_snapshot
                  FROM takes WHERE id = %s
            """, (row[10],))
            take = cursor.fetchone() if row[10] else None
        return {
            "id": row[0], "public_id": str(row[1]),
            "production_id": row[2], "position": row[3], "kind": row[4],
            "text": row[5], "title": row[6], "cast_role_id": row[7],
            "editorial_status": row[8], "revision": row[9],
            "selected_take_id": row[10], "asset_id": row[11],
            "asset_version_id": row[12], "duration_ms": row[13],
            "created_at": row[14], "updated_at": row[15],
            "filename": take[0] if take else "",
            "voice": (take[1] or (take[3] or {}).get("voice")) if take else "",
            "voice_name": (take[4] or (take[3] or {}).get("voice_name")) if take else "",
            "voice_identity_id": take[2] if take else None,
        }

    def parts(self, production_id: int) -> list[dict[str, Any]]:
        """Return Parts plus a read-only projection of the selected Take."""
        with read_only() as cursor:
            cursor.execute("""
                SELECT part.id, part.public_id, part.created_at, part.position,
                       part.kind, part.title, part.script, role.public_id,
                       role.name, part.editorial_status, part.revision,
                       part.selected_take_id, part.asset_id,
                       part.asset_version_id, part.duration_ms,
                       draft.state,
                       take.created_at, take.source_part_revision,
                       take.voice_identity_id, take.provider_voice_id,
                       take.model_id, take.tier, take.language, take.delivery,
                       take.filename, take.size_bytes, take.cost,
                       take.duration_ms, take.cost_basis, take.diagnostics,
                       take.snapshot, take.capability_id,
                       coalesce(history.take_count, 0),
                       coalesce(history.spend, 0),
                       version.filename, version.duration_ms,
                       coalesce(captions.subtitled, false),
                       coalesce(captions.stale, false),
                       coalesce(captions.languages, ARRAY[]::text[]),
                       take.binding_id, take.catalogue_voice_id,
                       speech_job.public_id, speech_job.status,
                       CASE WHEN speech_job.total > 0
                            THEN speech_job.done::float / speech_job.total
                            ELSE 0 END,
                       coalesce(speech_job.detail, ''),
                       coalesce(speech_job.error, ''), speech_job.retries,
                       speech_job.created_at, speech_job.started_at,
                       speech_job.finished_at, speech_job.payload,
                       speech_job.result,
                       take.source_script_hash, take.voice_name_snapshot,
                       take.public_id, take.reference_id, take.provider,
                       take.provider_region, take.tier,
                       attempt.public_id, attempt.status,
                       take.raw_text, take.spoken_text, take.tagged_text,
                       take.delivery, take.usage, take.segmentation,
                       take.binding_resolution_status,
                       collection.kind, collection.name
                  FROM production_parts part
                  LEFT JOIN production_cast_roles role ON role.id = part.cast_role_id
                  LEFT JOIN composition_drafts draft ON draft.part_id = part.id
                  LEFT JOIN takes take ON take.id = part.selected_take_id
                  LEFT JOIN provider_attempts attempt
                    ON attempt.id = take.provider_attempt_id
                  LEFT JOIN asset_versions version ON version.id = part.asset_version_id
                  LEFT JOIN assets asset ON asset.id = part.asset_id
                  LEFT JOIN asset_collections collection ON collection.id = asset.collection_id
                  LEFT JOIN LATERAL (
                    SELECT count(*) AS take_count, coalesce(sum(cost), 0) AS spend
                      FROM takes item WHERE item.part_id = part.id
                  ) history ON true
                  LEFT JOIN LATERAL (
                    SELECT bool_or(transcript.translated_from IS NULL) AS subtitled,
                           bool_or(transcript.stale AND transcript.translated_from IS NULL) AS stale,
                           array_agg(DISTINCT transcript.language)
                             FILTER (WHERE transcript.translated_from IS NOT NULL) AS languages
                      FROM transcripts transcript
                     WHERE transcript.part_id = part.id
                       AND (transcript.take_id IS NULL OR transcript.take_id = take.id)
                  ) captions ON true
                  LEFT JOIN LATERAL (
                    SELECT job.public_id, job.status, job.done, job.total,
                           job.detail, job.error, job.retries, job.created_at,
                           job.started_at, job.finished_at, job.payload,
                           job.result
                      FROM jobs job
                     WHERE job.part_id=part.id AND job.kind='speech'
                     ORDER BY job.created_at DESC, job.id DESC LIMIT 1
                  ) speech_job ON true
                 WHERE part.production_id = %s AND part.archived_at IS NULL
                 ORDER BY part.position NULLS LAST, part.created_at, part.id
            """, (production_id,))
            rows = cursor.fetchall()
        result = []
        for row in rows:
            draft = row[15] or {}
            snapshot = row[30] or {}
            diagnostics = row[29] or {}
            delivery = row[23] or {}
            job_payload = row[50] or {}
            job_result = row[51] or {}
            selected_revision = row[17]
            item = {
                "id": row[0], "public_id": str(row[1]),
                "created_at": row[2].isoformat(), "position": row[3],
                "kind": row[4], "title": row[5] or None,
                "text": row[6], "cast_role_id": row[7],
                "cast_role_name": row[8], "editorial_status": row[9],
                "revision": row[10], "selected_take_id": row[11],
                "outdated": bool(row[11] and (
                    selected_revision != row[10]
                    or row[52] != script_hash(row[6]))),
                "asset_id": row[12], "asset_version_id": row[13],
                "duration_ms": row[27] if row[11] else row[14],
                "text_raw": snapshot.get("text_raw", draft.get("text_raw")),
                "text_shaped": snapshot.get("text_shaped", draft.get("text_shaped")),
                "text_tagged": snapshot.get("text_tagged", draft.get("text_tagged")),
                "text_state": snapshot.get("text_state", draft.get("text_state", "raw")),
                "voice_identity_id": row[18] or draft.get("voice_identity_id") or job_payload.get("voice_identity_id"),
                "voice": row[19] or snapshot.get("voice") or draft.get("legacy_voice") or job_payload.get("voice", ""),
                "voice_name": row[53] or snapshot.get("voice_name") or job_payload.get("voice_name", ""),
                "take_public_id": str(row[54]) if row[54] else None,
                "reference_id": row[55],
                "provider": row[56] or snapshot.get("provider"),
                "provider_region": row[57] or snapshot.get("provider_region"),
                "tier": row[58] or snapshot.get("tier"),
                "provider_attempt_id": str(row[59]) if row[59] else None,
                "provider_attempt_status": row[60],
                "take_raw_text": row[61],
                "take_spoken_text": row[62],
                "take_tagged_text": row[63],
                "take_delivery": row[64] or {},
                "take_usage": row[65] or {},
                "take_segmentation": row[66] or {},
                "binding_resolution_status": row[67],
                "asset_kind": row[68],
                "asset_collection": row[69],
                "engine": snapshot.get("engine") or draft.get("legacy_engine") or job_payload.get("engine"),
                "model": row[20] or snapshot.get("model") or draft.get("legacy_model") or job_payload.get("model"),
                "format": snapshot.get("format") or draft.get("format") or job_payload.get("format", "mp3"),
                "language": row[22] or draft.get("language") or job_payload.get("language"),
                "instruction": delivery.get("instruction", draft.get("instruction", job_payload.get("instruction", ""))),
                "speech_mode": delivery.get("speech_mode", snapshot.get("speech_mode", job_payload.get("speech_mode", "exact"))),
                "rate": _float(delivery.get("rate", snapshot.get("rate", job_payload.get("rate"))), 1),
                "pitch": _float(delivery.get("pitch", snapshot.get("pitch", job_payload.get("pitch"))), 1),
                "volume": int(delivery.get("volume", snapshot.get("volume", job_payload.get("volume", 50))) or 50),
                "seed": int(delivery.get("seed", snapshot.get("seed", job_payload.get("seed", 0))) or 0),
                "filename": row[24] or row[34] or "",
                "size_bytes": int(row[25] or 0), "cost": _float(row[26]),
                "spent": _float(row[33]), "cost_basis": row[28],
                "provider_text": diagnostics.get("provider_text"),
                "fidelity": diagnostics.get("fidelity") or None,
                "capability_id": row[31] or job_payload.get("capability_id"),
                "binding_id": str(row[39]) if row[39] else job_payload.get("binding_id"),
                "catalogue_voice_id": row[40] or job_payload.get("catalogue_voice_id"),
                "takes": max(0, int(row[32] or 0) - (1 if row[11] else 0)),
                "subtitled": bool(row[36]), "subtitles_stale": bool(row[37]),
                "languages": sorted(set(row[38] or [])),
            }
            if row[41]:
                request = {
                    key: value for key, value in (row[50] or {}).items()
                    if not str(key).startswith("_")
                    and key not in {"operation", "part_id"}
                }
                item["speech_job"] = {
                    "id": str(row[41]), "type": "speech",
                    "status": row[42], "progress": float(row[43] or 0),
                    "detail": row[44] or "", "error": row[45] or None,
                    "retries": int(row[46] or 0),
                    "created_at": row[47].isoformat() if row[47] else None,
                    "started_at": row[48].isoformat() if row[48] else None,
                    "finished_at": row[49].isoformat() if row[49] else None,
                    "part_id": row[0], "result": job_result, "request": request,
                }
            if item["kind"] == "asset":
                item["missing"] = not bool(row[34])
                item["duration_ms"] = row[35] or item["duration_ms"]
            result.append(item)
        return result

    def next_position(self, production_id: int) -> int:
        with read_only() as cursor:
            return self._next_position(cursor, production_id)

    def create_part(self, production_id: int, values: dict[str, Any],
                    insert_at: int | None = None,
                    before_part_public_id: str | None = None) -> int | None:
        with transaction() as cursor:
            if self._legacy_id(cursor, production_id, lock=True) is None:
                return None
            next_position = self._next_position(cursor, production_id)
            if before_part_public_id:
                cursor.execute("""
                    SELECT position FROM production_parts
                     WHERE public_id=%s AND production_id=%s
                       AND archived_at IS NULL FOR UPDATE
                """, (before_part_public_id, production_id))
                anchor = cursor.fetchone()
                if not anchor:
                    raise ValueError(
                        "The selected insertion point no longer exists.")
                position = int(anchor[0])
            else:
                position = next_position if insert_at is None else max(
                    0, min(int(insert_at), next_position))
            if position < next_position:
                cursor.execute("""
                    UPDATE production_parts SET position = position + 1,
                           updated_at = now()
                     WHERE production_id = %s AND archived_at IS NULL
                       AND position >= %s
                """, (production_id, position))
            raw_kind = str(values.get("kind") or "speech")
            kind = "speech" if raw_kind in {"audio", "speech"} else raw_kind
            script = str(values.get("text") or "")
            cursor.execute("""
                INSERT INTO production_parts
                    (production_id, position, kind, script, title,
                     editorial_status, asset_id, asset_version_id, duration_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (production_id, position, kind, script,
                  str(values.get("title") or ""),
                  "draft" if kind == "draft" else "ready",
                  values.get("asset_id"), values.get("asset_version_id"),
                  values.get("duration_ms")))
            part_id = int(cursor.fetchone()[0])
            if kind == "draft":
                cursor.execute("""
                    INSERT INTO composition_drafts (part_id, production_id, state)
                    VALUES (%s, %s, %s::jsonb)
                """, (part_id, production_id, json.dumps(values)))
            return part_id

    def insert_asset(self, production_id: int, asset_id: int,
                     insert_at: int | None = None,
                     before_part_public_id: str | None = None) -> int | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT asset.id, version.id, asset.name, version.duration_ms
                  FROM assets asset
                  JOIN productions production ON production.id = %s
                  JOIN work_projects project ON project.id = production.project_id
                  JOIN LATERAL (
                    SELECT item.* FROM asset_versions item
                     WHERE item.asset_id = asset.id ORDER BY item.version DESC LIMIT 1
                  ) version ON true
                 WHERE asset.id = %s AND asset.venture_id = project.venture_id
                   AND asset.kind IN ('intros','outros','stingers')
            """, (production_id, asset_id))
            row = cursor.fetchone()
        if not row:
            return None
        return self.create_part(production_id, {
            "kind": "asset", "text": row[2] or "", "title": row[2] or "",
            "asset_id": row[0], "asset_version_id": row[1],
            "duration_ms": row[3],
        }, insert_at, before_part_public_id)

    def replace_asset(self, production_id: int, part_id: int,
                      asset_id: int) -> bool:
        with transaction() as cursor:
            cursor.execute("""
                SELECT version.id, asset.name, version.duration_ms
                  FROM assets asset
                  JOIN productions production ON production.id=%s
                  JOIN work_projects project ON project.id=production.project_id
                  JOIN LATERAL (
                    SELECT item.* FROM asset_versions item
                     WHERE item.asset_id=asset.id
                     ORDER BY item.version DESC LIMIT 1
                  ) version ON true
                 WHERE asset.id=%s AND asset.venture_id=project.venture_id
                   AND asset.kind IN ('intros','outros','stingers')
            """, (production_id, asset_id))
            asset = cursor.fetchone()
            if not asset:
                return False
            cursor.execute("""
                UPDATE production_parts
                   SET asset_id=%s, asset_version_id=%s, script=%s, title=%s,
                       duration_ms=%s, revision=revision+1, updated_at=now()
                 WHERE id=%s AND production_id=%s AND kind='asset'
                   AND archived_at IS NULL
            """, (asset_id, asset[0], asset[1] or "", asset[1] or "",
                  asset[2], part_id, production_id))
            return cursor.rowcount == 1

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
                     WHERE item.asset_id = asset.id ORDER BY item.version DESC LIMIT 1
                  ) version ON true
                 WHERE mix.production_id = %s
            """, (production_id,))
            row = cursor.fetchone()
        if not row:
            return {}
        return {"music_of": row[0], "level": row[1] or "discreet",
                "fade_in": _float(row[2]), "fade_out": _float(row[3]),
                "duck": bool(row[4]), "volume": _float(row[5]),
                "start": _float(row[6]), "filename": row[7] or "",
                "name": (row[8] or "")[:80], "duration_ms": row[9]}

    def set_music(self, production_id: int, values: dict[str, Any]) -> bool:
        aliases = {"music_of": "music_asset_id", "music_level": "level",
                   "music_fade_in": "fade_in_seconds",
                   "music_fade_out": "fade_out_seconds", "music_duck": "duck",
                   "music_volume": "volume", "music_start": "start_seconds"}
        provided = {aliases[key]: value for key, value in values.items() if key in aliases}
        if not provided:
            return False
        with transaction() as cursor:
            if self._legacy_id(cursor, production_id, lock=True) is None:
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
            state["volume"] = max(0, min(1, _float(state["volume"], .1)))
            state["start_seconds"] = max(0, _float(state["start_seconds"]))
            if state["music_asset_id"] not in (None, "", 0, "0"):
                cursor.execute("""
                    SELECT 1 FROM assets asset
                    JOIN productions production ON production.id = %s
                    JOIN work_projects project ON project.id = production.project_id
                    WHERE asset.id = %s AND asset.kind = 'music'
                      AND asset.venture_id = project.venture_id
                """, (production_id, int(state["music_asset_id"])))
                if not cursor.fetchone():
                    return False
                state["music_asset_id"] = int(state["music_asset_id"])
            else:
                state["music_asset_id"] = None
            cursor.execute("""
                INSERT INTO production_mixes
                    (production_id, music_asset_id, level, volume, start_seconds,
                     fade_in_seconds, fade_out_seconds, duck, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,now())
                ON CONFLICT (production_id) DO UPDATE SET
                    music_asset_id=EXCLUDED.music_asset_id, level=EXCLUDED.level,
                    volume=EXCLUDED.volume, start_seconds=EXCLUDED.start_seconds,
                    fade_in_seconds=EXCLUDED.fade_in_seconds,
                    fade_out_seconds=EXCLUDED.fade_out_seconds,
                    duck=EXCLUDED.duck, updated_at=now()
            """, (production_id, state["music_asset_id"], state["level"],
                  state["volume"], state["start_seconds"], state["fade_in_seconds"],
                  state["fade_out_seconds"], state["duck"]))
            return True

    def reorder(self, production_id: int, ordered_ids: list[int]) -> bool:
        ordered_ids = [int(item) for item in ordered_ids]
        if len(ordered_ids) != len(set(ordered_ids)):
            return False
        with transaction() as cursor:
            cursor.execute("""
                SELECT id FROM production_parts
                 WHERE production_id = %s AND archived_at IS NULL FOR UPDATE
                 ORDER BY position NULLS LAST, created_at, id
            """, (production_id,))
            current = [int(row[0]) for row in cursor.fetchall()]
            if any(item not in set(current) for item in ordered_ids):
                return False
            final = ordered_ids + [item for item in current if item not in set(ordered_ids)]
            for position, part_id in enumerate(final):
                cursor.execute("UPDATE production_parts SET position=%s, updated_at=now() WHERE id=%s",
                               (position, part_id))
            return True

    def save_script(self, production_id: int, part_id: int, script: str,
                    values: dict[str, Any] | None = None) -> bool:
        values = values or {}
        with transaction() as cursor:
            row = self._part_row(cursor, production_id, part_id, lock=True)
            if not row:
                return False
            next_script = str(script)
            next_title = row[6] if "title" not in values else str(values.get("title") or "")
            next_duration = row[13] if "duration_ms" not in values else values["duration_ms"]
            changed = next_script != row[5]
            cursor.execute("""
                UPDATE production_parts
                   SET script=%s, title=%s, duration_ms=%s,
                       revision=revision + %s, updated_at=now()
                 WHERE id=%s
            """, (next_script, next_title, next_duration, 1 if changed else 0, part_id))
            return True

    def save_editorial(self, production_id: int, part_id: int,
                       expected_revision: int,
                       values: dict[str, Any]) -> dict[str, Any] | None:
        """Apply an explicit editorial mutation with optimistic concurrency."""
        with transaction() as cursor:
            row = self._part_row(cursor, production_id, part_id, lock=True)
            if not row:
                return None
            current_revision = int(row[9])
            if current_revision != int(expected_revision):
                return {"status": "conflict", "revision": current_revision}
            next_script = (str(values["script"]) if "script" in values
                           else str(row[5] or ""))
            next_role_id = row[7]
            if "cast_role_id" in values:
                role_public_id = values.get("cast_role_id")
                if role_public_id:
                    cursor.execute("""
                        SELECT id FROM production_cast_roles
                         WHERE public_id=%s AND production_id=%s
                    """, (role_public_id, production_id))
                    role = cursor.fetchone()
                    if not role:
                        raise ValueError(
                            "That Cast Role does not belong to this Production.")
                    next_role_id = int(role[0])
                else:
                    next_role_id = None
            changed_fields = []
            if next_script != str(row[5] or ""):
                changed_fields.append("script")
            if next_role_id != row[7]:
                changed_fields.append("cast_role_id")
            if not changed_fields:
                selected_outdated = False
                if row[10]:
                    cursor.execute(
                        "SELECT source_part_revision, source_script_hash "
                        "FROM takes WHERE id=%s",
                        (row[10],))
                    selected = cursor.fetchone()
                    selected_outdated = bool(
                        selected and (
                            int(selected[0]) != current_revision
                            or str(selected[1]) != script_hash(next_script)))
                return {"status": "ok", "changed": False,
                        "revision": current_revision,
                        "outdated": selected_outdated}
            next_revision = current_revision + 1
            cursor.execute("""
                UPDATE production_parts
                   SET script=%s, cast_role_id=%s, revision=%s, updated_at=now()
                 WHERE id=%s
            """, (next_script, next_role_id, next_revision, part_id))
            cursor.execute("""
                INSERT INTO audit_records
                    (action, resource_type, resource_id, detail)
                VALUES ('part.editorial_updated','production_part',%s,%s::jsonb)
            """, (str(row[1]), json.dumps({
                "from_revision": current_revision,
                "to_revision": next_revision,
                "changed_fields": changed_fields,
            })))
            return {"status": "ok", "changed": True,
                    "revision": next_revision,
                    "outdated": bool(row[10])}

    def save_draft(self, production_id: int, part_id: int,
                   values: dict[str, Any]) -> bool:
        with transaction() as cursor:
            if not self._part_row(cursor, production_id, part_id, lock=True):
                return False
            cursor.execute("""
                INSERT INTO composition_drafts (part_id, production_id, state)
                VALUES (%s,%s,%s::jsonb)
                ON CONFLICT (part_id) DO UPDATE SET
                    state=composition_drafts.state || EXCLUDED.state,
                    updated_at=now()
            """, (part_id, production_id, json.dumps(values)))
            return True

    def duplicate(self, production_id: int, part_id: int,
                  filename: str = "") -> int | None:
        with transaction() as cursor:
            row = self._part_row(cursor, production_id, part_id, lock=True)
            if not row:
                return None
            position = int(row[3] or 0) + 1
            cursor.execute("""
                UPDATE production_parts SET position=position+1, updated_at=now()
                 WHERE production_id=%s AND archived_at IS NULL AND position >= %s
            """, (production_id, position))
            cursor.execute("""
                INSERT INTO production_parts
                    (production_id, position, kind, script, title, cast_role_id,
                     editorial_status, asset_id, asset_version_id, duration_ms)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
            """, (production_id, position, row[4], row[5], row[6], row[7],
                  row[8], row[11], row[12], row[13]))
            new_id = int(cursor.fetchone()[0])
            if row[10]:
                cursor.execute("""
                    INSERT INTO takes
                        (part_id, source_part_revision, source_script_hash,
                         cast_assignment_revision, persona_id,
                         persona_name_snapshot, cast_role_id,
                         cast_role_name_snapshot, voice_identity_id,
                         voice_name_snapshot, reference_id, binding_id,
                         catalogue_voice_id, binding_resolution_status,
                         capability_id, capability_name_snapshot, provider,
                         provider_region, provider_voice_id, model_id, tier,
                         language, raw_text, spoken_text, tagged_text, delivery,
                         segmentation, usage, cost, cost_basis, diagnostics,
                         filename, path, size_bytes, duration_ms, snapshot)
                    SELECT %s, 1, %s, cast_assignment_revision, persona_id,
                           persona_name_snapshot, cast_role_id,
                           cast_role_name_snapshot, voice_identity_id,
                           voice_name_snapshot, reference_id, binding_id,
                           catalogue_voice_id, binding_resolution_status,
                           capability_id, capability_name_snapshot, provider,
                           provider_region, provider_voice_id, model_id, tier,
                           language, raw_text, spoken_text, tagged_text, delivery,
                           segmentation, usage, 0, 'reused', diagnostics,
                           %s, path, size_bytes, duration_ms, snapshot
                      FROM takes WHERE id=%s RETURNING id
                """, (new_id, script_hash(row[5]), filename or "", row[10]))
                new_take = int(cursor.fetchone()[0])
                cursor.execute("UPDATE production_parts SET selected_take_id=%s WHERE id=%s",
                               (new_take, new_id))
            return new_id

    def delete(self, production_id: int, ids: list[int]) -> list[str] | None:
        ids = [int(item) for item in ids]
        with transaction() as cursor:
            cursor.execute("""
                SELECT id FROM production_parts
                 WHERE production_id=%s AND id=ANY(%s) AND archived_at IS NULL FOR UPDATE
            """, (production_id, ids))
            if {int(row[0]) for row in cursor.fetchall()} != set(ids):
                return None
            cursor.execute("""
                SELECT filename FROM takes WHERE part_id=ANY(%s) AND filename<>''
            """, (ids,))
            files = [row[0] for row in cursor.fetchall()]
            cursor.execute("""
                UPDATE production_parts SET archived_at=now(), selected_take_id=NULL,
                       updated_at=now() WHERE id=ANY(%s)
            """, (ids,))
            cursor.execute("""
                WITH ranked AS (
                    SELECT id, row_number() OVER (ORDER BY position, created_at, id)-1 AS next
                      FROM production_parts
                     WHERE production_id=%s AND archived_at IS NULL)
                UPDATE production_parts part SET position=ranked.next, updated_at=now()
                  FROM ranked WHERE part.id=ranked.id
            """, (production_id,))
            return list(dict.fromkeys(files))

    def move(self, source_production_id: int, ids: list[int],
             destination_production_id: int) -> bool:
        ids = [int(item) for item in ids]
        with transaction() as cursor:
            if self._legacy_id(cursor, destination_production_id, lock=True) is None:
                return False
            cursor.execute("""
                SELECT id FROM production_parts
                 WHERE production_id=%s AND id=ANY(%s) AND archived_at IS NULL FOR UPDATE
            """, (source_production_id, ids))
            if {int(row[0]) for row in cursor.fetchall()} != set(ids):
                return False
            start = self._next_position(cursor, destination_production_id)
            for offset, part_id in enumerate(ids):
                cursor.execute("""
                    UPDATE production_parts SET production_id=%s, position=%s,
                           updated_at=now() WHERE id=%s
                """, (destination_production_id, start + offset, part_id))
                cursor.execute("UPDATE composition_drafts SET production_id=%s WHERE part_id=%s",
                               (destination_production_id, part_id))
            cursor.execute("""
                WITH ranked AS (
                    SELECT id, row_number() OVER (ORDER BY position, created_at, id)-1 AS next
                      FROM production_parts
                     WHERE production_id=%s AND archived_at IS NULL)
                UPDATE production_parts part SET position=ranked.next, updated_at=now()
                  FROM ranked WHERE part.id=ranked.id
            """, (source_production_id,))
            return True

    def takes(self, production_id: int, part_id: int) -> list[dict[str, Any]] | None:
        with read_only() as cursor:
            part = self._part_row(cursor, production_id, part_id)
            if not part:
                return None
            cursor.execute("""
                SELECT take.id, take.created_at, take.provider_voice_id,
                       take.voice_identity_id, take.model_id, take.tier,
                       take.filename, take.size_bytes, take.cost,
                       take.spoken_text, take.duration_ms, take.delivery,
                       take.language, take.diagnostics,
                       take.source_part_revision, take.source_script_hash,
                       take.binding_id, take.capability_id, take.snapshot,
                       take.voice_name_snapshot, take.public_id,
                       take.reference_id, take.catalogue_voice_id,
                       take.provider, take.provider_region, take.tier,
                       take.raw_text, take.tagged_text, take.usage,
                       take.segmentation, take.cost_basis,
                       take.binding_resolution_status,
                       attempt.public_id, attempt.status
                  FROM takes take
                  LEFT JOIN provider_attempts attempt
                    ON attempt.id = take.provider_attempt_id
                 WHERE take.part_id=%s AND take.id IS DISTINCT FROM %s
                 ORDER BY take.created_at DESC
            """, (part_id, part[10]))
            rows = cursor.fetchall()
        return [{
            "id": row[0], "when": row[1].isoformat(), "voice": row[2] or "",
            "voice_name": row[19] or (row[18] or {}).get("voice_name") or "",
            "public_id": str(row[20]), "reference_id": row[21],
            "catalogue_voice_id": row[22], "provider": row[23],
            "provider_region": row[24], "tier": row[25],
            "raw_text": row[26], "tagged_text": row[27],
            "usage": row[28] or {}, "segmentation": row[29] or {},
            "cost_basis": row[30], "binding_resolution_status": row[31],
            "provider_attempt_id": str(row[32]) if row[32] else None,
            "provider_attempt_status": row[33],
            "voice_identity_id": row[3], "engine": (row[18] or {}).get("engine", ""),
            "model": row[4] or "", "rate": _float((row[11] or {}).get("rate"), 1),
            "pitch": _float((row[11] or {}).get("pitch"), 1),
            "seed": int((row[11] or {}).get("seed", 0) or 0),
            "filename": row[6], "size_bytes": int(row[7] or 0),
            "cost": _float(row[8]), "text": row[9] or "",
            "duration_ms": row[10], "instruction": (row[11] or {}).get("instruction"),
            "language": row[12], "fidelity": (row[13] or {}).get("fidelity") or None,
            "source_part_revision": row[14],
            "outdated": (row[14] != part[9]
                         or row[15] != script_hash(str(part[5] or ""))),
            "source_script_hash": row[15],
            "binding_id": str(row[16]) if row[16] else None,
            "capability_id": row[17],
        } for row in rows]

    def promote(self, production_id: int, part_id: int, take_id: int,
                expected_revision: int,
                confirm_outdated: bool = False) -> dict[str, Any] | None:
        with transaction() as cursor:
            row = self._part_row(cursor, production_id, part_id, lock=True)
            if not row:
                return None
            current_revision = int(row[9])
            if current_revision != int(expected_revision):
                return {"status": "conflict", "revision": current_revision}
            cursor.execute("SELECT source_part_revision, source_script_hash FROM takes WHERE id=%s AND part_id=%s",
                           (take_id, part_id))
            take = cursor.fetchone()
            if not take:
                return None
            outdated = (int(take[0]) != current_revision
                        or str(take[1]) != script_hash(str(row[5] or "")))
            if outdated and not confirm_outdated:
                return {"status": "confirmation_required",
                        "revision": current_revision, "outdated": True}
            cursor.execute("UPDATE production_parts SET selected_take_id=%s, updated_at=now() WHERE id=%s",
                           (take_id, part_id))
            cursor.execute("""
                INSERT INTO audit_records
                    (action, resource_type, resource_id, detail)
                VALUES ('take.selected','production_part',%s,%s::jsonb)
            """, (str(row[1]), json.dumps({
                "take_id": take_id, "part_revision": current_revision,
                "take_revision": int(take[0]), "outdated": outdated,
            })))
            return {"status": "ok", "revision": current_revision,
                    "outdated": outdated}
