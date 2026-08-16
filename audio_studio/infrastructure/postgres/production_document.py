"""Canonical PostgreSQL persistence for an editable Production document.

Parts own editorial intent. The internal recording snapshot owns generated
performance facts. Provider settings are exposed from that active snapshot
shape; they are never written back onto the Part.
"""

from __future__ import annotations

from hashlib import sha256
import json
from typing import Any

from audio_studio.infrastructure.postgres.session import read_only, transaction
from audio_studio.infrastructure.postgres.part_positions import (
    release_archived_positions,
)


MUSIC_LEVELS = {"discreet": 0.10, "present": 0.20, "loud": 0.34}


def script_hash(value: str) -> str:
    return sha256((value or "").encode()).hexdigest()


def _float(value, default: float = 0) -> float:
    return float(value if value is not None else default)


def _int(value, default: int = 0) -> int:
    return int(value if value is not None else default)


class ProductionDocumentRepository:
    """Own stable Parts, one recording snapshot and background-music state."""

    @staticmethod
    def _production_exists(
        cursor, production_id: int, *, lock: bool = False,
    ) -> bool:
        cursor.execute(
            "SELECT 1 FROM productions "
            "WHERE id = %s AND archived_at IS NULL" + (" FOR UPDATE" if lock else ""),
            (production_id,),
        )
        return cursor.fetchone() is not None

    @staticmethod
    def _part_row(cursor, production_id: int, part_id: int, *, lock=False):
        cursor.execute("""
            SELECT id, public_id, production_id, position, kind, script, title,
                   NULL::bigint, editorial_status, revision,
                   (SELECT clip.id FROM clips clip WHERE clip.part_id = production_parts.id),
                   asset_id, asset_version_id, duration_ms, created_at, updated_at,
                   enabled, authored_role
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
        """Compatibility read for callers not yet renamed to Part/Clip."""
        with read_only() as cursor:
            cursor.execute("""
                SELECT part.id, part.created_at, part.position, part.kind,
                       part.title, part.script, part.revision, part.editorial_status,
                       clip.snapshot, clip.filename, clip.path, clip.size_bytes,
                       clip.duration_ms, clip.cost, clip.language, clip.usage,
                       clip.cost_basis, clip.diagnostics, clip.voice_identity_id,
                       clip.provider_voice_id, clip.model_id, clip.tier,
                       part.production_id
                  FROM production_parts part
                  LEFT JOIN clips clip ON clip.part_id = part.id
                 WHERE part.id = %s AND part.archived_at IS NULL
            """, (identifier,))
            row = cursor.fetchone()
            if not row:
                cursor.execute("""
                    SELECT part.id, clip.created_at, part.position, part.kind,
                           part.title, part.script, part.revision,
                           part.editorial_status, clip.snapshot, clip.filename,
                           clip.path, clip.size_bytes, clip.duration_ms, clip.cost,
                           clip.language, clip.usage, clip.cost_basis,
                           clip.diagnostics, clip.voice_identity_id,
                           clip.provider_voice_id, clip.model_id, clip.tier,
                           part.production_id
                      FROM clips clip
                      JOIN production_parts part ON part.id = clip.part_id
                     WHERE clip.id = %s
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
                  FROM clips WHERE part_id = %s
            """, (part_id,))
            clip = cursor.fetchone() if row[10] else None
        return {
            "id": row[0], "public_id": str(row[1]),
            "production_id": row[2], "position": row[3], "kind": row[4],
            "text": row[5], "title": row[6],
            "editorial_status": row[8], "revision": row[9],
            "clip_id": row[10], "asset_id": row[11],
            "asset_version_id": row[12], "duration_ms": row[13],
            "created_at": row[14], "updated_at": row[15],
            "enabled": bool(row[16]),
            "authored_role": row[17],
            "filename": clip[0] if clip else "",
            "voice": (clip[1] or (clip[3] or {}).get("voice")) if clip else "",
            "voice_name": (clip[4] or (clip[3] or {}).get("voice_name")) if clip else "",
            "voice_identity_id": clip[2] if clip else None,
        }

    def parts(self, production_id: int) -> list[dict[str, Any]]:
        """Return Parts plus a read-only projection of the active recording."""
        with read_only() as cursor:
            cursor.execute("""
                SELECT part.id, part.public_id, part.created_at, part.position,
                       part.kind, part.title, part.script, NULL::uuid,
                       NULL::text, part.editorial_status, part.revision,
                       clip.id, part.asset_id,
                       part.asset_version_id, part.duration_ms,
                       draft.state,
                       clip.created_at, clip.source_part_revision,
                       clip.voice_identity_id, clip.provider_voice_id,
                       clip.model_id, clip.tier, clip.language, clip.delivery,
                       clip.filename, clip.size_bytes, clip.cost,
                       clip.duration_ms, clip.cost_basis, clip.diagnostics,
                       clip.snapshot, clip.capability_id,
                       CASE WHEN clip.id IS NULL THEN 0 ELSE 1 END,
                       coalesce(history.spend, 0),
                       version.filename, version.duration_ms,
                       coalesce(captions.subtitled, false),
                       coalesce(captions.stale, false),
                       coalesce(captions.languages, ARRAY[]::text[]),
                       clip.binding_id, clip.catalogue_voice_id,
                       speech_job.public_id, speech_job.status,
                       CASE WHEN speech_job.total > 0
                            THEN speech_job.done::float / speech_job.total
                            ELSE 0 END,
                       coalesce(speech_job.detail, ''),
                       coalesce(speech_job.error, ''), speech_job.retries,
                       speech_job.created_at, speech_job.started_at,
                       speech_job.finished_at, speech_job.payload,
                       speech_job.result,
                       clip.source_script_hash, clip.voice_name_snapshot,
                       clip.public_id, clip.reference_id, clip.provider,
                       clip.provider_region, clip.tier,
                       attempt.public_id, attempt.status,
                       clip.raw_text, clip.spoken_text, clip.tagged_text,
                       clip.delivery, clip.usage, clip.segmentation,
                       clip.binding_resolution_status,
                       collection.kind, collection.name,
                       NULL::bigint,
                       caption_job.public_id, caption_job.status,
                       CASE WHEN caption_job.total > 0
                            THEN caption_job.done::float / caption_job.total
                            ELSE 0 END,
                       coalesce(caption_job.detail, ''),
                       coalesce(caption_job.error, ''), caption_job.retries,
                       caption_job.created_at, caption_job.started_at,
                       caption_job.finished_at, caption_job.payload,
                       caption_job.result, clip.capability_name_snapshot,
                       captions.source_language, part.enabled,
                       part.authored_role
                  FROM production_parts part
                  LEFT JOIN composition_drafts draft ON draft.part_id = part.id
                  LEFT JOIN clips clip ON clip.part_id = part.id
                  LEFT JOIN provider_attempts attempt
                    ON attempt.id = clip.provider_attempt_id
                  LEFT JOIN asset_versions version ON version.id = part.asset_version_id
                  LEFT JOIN assets asset ON asset.id = part.asset_id
                  LEFT JOIN asset_collections collection ON collection.id = asset.collection_id
                  LEFT JOIN LATERAL (
                    SELECT coalesce((
                             SELECT sum(CASE
                               WHEN attempt.status = 'ambiguous'
                                 THEN greatest(attempt.estimated_cost,
                                               coalesce(attempt.cost, 0))
                               ELSE coalesce(attempt.cost, 0)
                             END)
                               FROM provider_attempts attempt
                               JOIN jobs job ON job.id = attempt.job_id
                              WHERE job.part_id = part.id
                                AND job.kind = 'speech'
                           ), 0)
                           + coalesce(sum(item.cost) FILTER (
                               WHERE item.provider_attempt_id IS NULL), 0)
                             AS spend
                      FROM clips item WHERE item.part_id = part.id
                  ) history ON true
                  LEFT JOIN LATERAL (
                    SELECT bool_or(transcript.translated_from IS NULL) AS subtitled,
                           bool_or(transcript.stale AND transcript.translated_from IS NULL) AS stale,
                           array_agg(DISTINCT transcript.language)
                             FILTER (WHERE transcript.translated_from IS NOT NULL) AS languages,
                           max(transcript.language)
                             FILTER (WHERE transcript.translated_from IS NULL) AS source_language
                      FROM transcripts transcript
                     WHERE transcript.part_id = part.id
                       AND (transcript.clip_id IS NULL OR transcript.clip_id = clip.id)
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
                  LEFT JOIN LATERAL (
                    SELECT job.public_id, job.status, job.done, job.total,
                           job.detail, job.error, job.retries, job.created_at,
                           job.started_at, job.finished_at, job.payload,
                           job.result
                      FROM jobs job
                     WHERE job.kind = 'transcribe'
                       AND (job.part_id = part.id
                         OR job.payload @> jsonb_build_object('part_id', part.id))
                       AND clip.id IS NOT NULL
                       AND (job.clip_id = clip.id
                         OR job.result @> jsonb_build_object('clip_id', clip.id)
                         OR (job.clip_id IS NULL
                           AND NOT (job.result ? 'clip_id')
                           AND job.payload->>'file' = clip.filename))
                     ORDER BY job.created_at DESC, job.id DESC LIMIT 1
                  ) caption_job ON true
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
            clip_revision = row[17]
            has_clip = row[11] is not None
            item = {
                "id": row[0], "public_id": str(row[1]),
                "created_at": row[2].isoformat(), "position": row[3],
                "kind": row[4], "title": row[5] or None,
                "text": row[6],
                "editorial_status": row[9],
                "revision": row[10], "clip_id": row[11],
                "recording_text_state": (
                    snapshot.get("text_state") if has_clip else None),
                "outdated": bool(row[11] and (
                    clip_revision != row[10]
                    or row[52] != script_hash(row[6]))),
                "asset_id": row[12], "asset_version_id": row[13],
                "duration_ms": row[27] if row[11] else row[14],
                "text_raw": snapshot.get("text_raw", draft.get("text_raw")),
                "text_shaped": snapshot.get("text_shaped", draft.get("text_shaped")),
                "text_tagged": snapshot.get("text_tagged", draft.get("text_tagged")),
                "text_state": snapshot.get("text_state", draft.get("text_state", "raw")),
                "voice_identity_id": (row[18] if has_clip else
                                      draft.get("voice_identity_id") or job_payload.get("voice_identity_id")),
                "voice": ((row[19] or snapshot.get("voice") or "") if has_clip else
                          draft.get("legacy_voice") or job_payload.get("voice", "")),
                "voice_name": ((row[53] or snapshot.get("voice_name") or "") if has_clip else
                               job_payload.get("voice_name", "")),
                "clip_public_id": str(row[54]) if row[54] else None,
                "reference_id": row[55],
                "provider": ((row[56] or snapshot.get("provider")) if has_clip else
                             job_payload.get("provider")),
                "provider_region": ((row[57] or snapshot.get("provider_region")) if has_clip else
                                    job_payload.get("provider_region")),
                "tier": ((row[58] or snapshot.get("tier")) if has_clip else
                         draft.get("legacy_model") or job_payload.get("model")),
                "provider_attempt_id": str(row[59]) if row[59] else None,
                "provider_attempt_status": row[60],
                "clip_raw_text": row[61],
                "clip_spoken_text": row[62],
                "clip_tagged_text": row[63],
                "clip_delivery": row[64] or {},
                "clip_usage": row[65] or {},
                "clip_segmentation": row[66] or {},
                "binding_resolution_status": row[67],
                "asset_kind": row[68],
                "asset_collection": row[69],
                "engine": (snapshot.get("engine") if has_clip else
                           draft.get("legacy_engine") or job_payload.get("engine")),
                "model": ((row[20] or snapshot.get("model")) if has_clip else
                          draft.get("legacy_model") or job_payload.get("model")),
                "format": snapshot.get("format") or draft.get("format") or job_payload.get("format", "mp3"),
                "language": ((row[22] or snapshot.get("language")) if has_clip else
                             draft.get("language") or job_payload.get("language")),
                "instruction": delivery.get("instruction", draft.get("instruction", job_payload.get("instruction", ""))),
                "speech_mode": delivery.get("speech_mode", snapshot.get("speech_mode", draft.get("speech_mode", job_payload.get("speech_mode", "exact")))),
                "rate": _float(delivery.get("rate", snapshot.get("rate", draft.get("rate", job_payload.get("rate")))), 1),
                "pitch": _float(delivery.get("pitch", snapshot.get("pitch", draft.get("pitch", job_payload.get("pitch")))), 1),
                "volume": _int(delivery.get("volume", snapshot.get("volume", draft.get("volume", job_payload.get("volume")))), 50),
                "seed": _int(delivery.get("seed", snapshot.get("seed", draft.get("seed", job_payload.get("seed")))), 0),
                "filename": row[24] or row[34] or "",
                "size_bytes": int(row[25] or 0), "cost": _float(row[26]),
                "spent": _float(row[33]), "cost_basis": row[28],
                "provider_text": diagnostics.get("provider_text"),
                "fidelity": diagnostics.get("fidelity") or None,
                "capability_id": ((row[31] or snapshot.get("capability_id")) if has_clip else
                                 job_payload.get("capability_id")),
                "capability_name": ((row[82] or snapshot.get("capability_name")) if has_clip else
                                   job_payload.get("capability_name")),
                "binding_id": ((str(row[39]) if row[39] else None) if has_clip else
                               job_payload.get("binding_id")),
                "catalogue_voice_id": (row[40] if has_clip else
                                       job_payload.get("catalogue_voice_id")),
                "subtitled": bool(row[36]), "subtitles_stale": bool(row[37]),
                "languages": sorted(set(row[38] or [])),
                "caption_source_language": row[83],
                "enabled": bool(row[84]),
                "authored_role": row[85],
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
            if row[71]:
                caption_payload = row[80] or {}
                item["caption_job"] = {
                    "id": str(row[71]), "type": "transcribe",
                    "status": row[72], "progress": float(row[73] or 0),
                    "detail": row[74] or "", "error": row[75] or None,
                    "retries": int(row[76] or 0),
                    "created_at": row[77].isoformat() if row[77] else None,
                    "started_at": row[78].isoformat() if row[78] else None,
                    "finished_at": row[79].isoformat() if row[79] else None,
                    "part_id": row[0], "result": row[81] or {},
                    "context": {
                        key: caption_payload.get(key)
                        for key in ("part_id", "production_id", "language")
                        if caption_payload.get(key) is not None
                    },
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
                    before_part_public_id: str | None = None) -> int | None:
        with transaction() as cursor:
            if not self._production_exists(cursor, production_id, lock=True):
                return None
            release_archived_positions(cursor, production_id)
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
                position = next_position
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

    def import_parts(
        self, production_id: int, items: list[dict[str, Any]],
        voice_identity_ids: set[str],
    ) -> dict[str, int] | None:
        """Append one import atomically with optional authored role labels."""
        with transaction() as cursor:
            if not self._production_exists(cursor, production_id, lock=True):
                return None
            if voice_identity_ids:
                cursor.execute("""
                    SELECT identity.id
                      FROM voice_identities identity
                     WHERE identity.id = ANY(%s)
                       AND identity.status = 'active'
                       AND EXISTS (
                           SELECT 1 FROM voice_bindings binding
                            WHERE binding.identity_id = identity.id
                              AND binding.source = 'custom'
                              AND binding.status IN ('active', 'ready')
                              AND binding.archived_at IS NULL)
                """, (list(voice_identity_ids),))
                valid = {str(row[0]) for row in cursor.fetchall()}
                invalid = sorted(voice_identity_ids - valid)
                if invalid:
                    raise ValueError(
                        "Every role must use an active owned Voice. Invalid: "
                        + ", ".join(invalid))
            release_archived_positions(cursor, production_id)
            position = self._next_position(cursor, production_id)
            counts = {"items": len(items), "speech": 0, "silence": 0}
            for offset, values in enumerate(items):
                kind = str(values["kind"])
                cursor.execute("""
                    INSERT INTO production_parts
                        (production_id, position, kind, script, title,
                         editorial_status, duration_ms, authored_role)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    RETURNING id
                """, (
                    production_id, position + offset, kind,
                    str(values.get("text") or ""),
                    str(values.get("title") or ""),
                    "draft" if kind == "draft" else "ready",
                    values.get("duration_ms"),
                    values.get("authored_role"),
                ))
                part_id = int(cursor.fetchone()[0])
                if kind == "draft":
                    cursor.execute("""
                        INSERT INTO composition_drafts
                            (part_id, production_id, state)
                        VALUES (%s,%s,%s::jsonb)
                    """, (part_id, production_id, json.dumps(values)))
                    counts["speech"] += 1
                else:
                    counts["silence"] += 1
            return counts

    def insert_asset(self, production_id: int, asset_id: int,
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
        }, before_part_public_id)

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
        aliases = {
            "music_of": "music_asset_id",
            "level": "level", "fade_in": "fade_in_seconds",
            "fade_out": "fade_out_seconds", "duck": "duck",
            "volume": "volume", "start": "start_seconds",
            # Persistence-only compatibility for historical callers. These
            # names are no longer part of the public HTTP contract.
            "music_level": "level", "music_fade_in": "fade_in_seconds",
            "music_fade_out": "fade_out_seconds", "music_duck": "duck",
            "music_volume": "volume", "music_start": "start_seconds",
        }
        provided = {aliases[key]: value for key, value in values.items() if key in aliases}
        if not provided:
            return False
        with transaction() as cursor:
            if not self._production_exists(cursor, production_id, lock=True):
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
            state["fade_in_seconds"] = max(
                0, min(120, _float(state["fade_in_seconds"], 2)))
            state["fade_out_seconds"] = max(
                0, min(120, _float(state["fade_out_seconds"], 4)))
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
                 WHERE production_id = %s AND archived_at IS NULL
                 ORDER BY position NULLS LAST, created_at, id
                 FOR UPDATE
            """, (production_id,))
            current = [int(row[0]) for row in cursor.fetchall()]
            if any(item not in set(current) for item in ordered_ids):
                return False
            final = ordered_ids + [item for item in current if item not in set(ordered_ids)]
            for position, part_id in enumerate(final):
                cursor.execute("UPDATE production_parts SET position=%s, updated_at=now() WHERE id=%s",
                               (position, part_id))
            return True

    def set_enabled(
        self, production_id: int, part_id: int, enabled: bool,
    ) -> bool:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE production_parts
                   SET enabled=%s, updated_at=now()
                 WHERE id=%s AND production_id=%s AND archived_at IS NULL
            """, (bool(enabled), part_id, production_id))
            return cursor.rowcount == 1

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
            changed_fields = []
            if next_script != str(row[5] or ""):
                changed_fields.append("script")
            if not changed_fields:
                selected_outdated = False
                if row[10]:
                    cursor.execute(
                        "SELECT source_part_revision, source_script_hash "
                        "FROM clips WHERE id=%s",
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
                   SET script=%s, revision=%s, updated_at=now()
                 WHERE id=%s
            """, (next_script, next_revision, part_id))
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
            release_archived_positions(cursor, production_id)
            position = int(row[3] or 0) + 1
            cursor.execute("""
                UPDATE production_parts SET position=position+1, updated_at=now()
                 WHERE production_id=%s AND archived_at IS NULL AND position >= %s
            """, (production_id, position))
            cursor.execute("""
                INSERT INTO production_parts
                    (production_id, position, kind, script, title,
                     editorial_status, asset_id, asset_version_id, duration_ms,
                     authored_role)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
            """, (production_id, position, row[4], row[5], row[6],
                  row[8], row[11], row[12], row[13], row[17]))
            new_id = int(cursor.fetchone()[0])
            if row[10]:
                cursor.execute("""
                    INSERT INTO clips
                        (part_id, source_part_revision, source_script_hash,
                         voice_identity_id,
                         voice_name_snapshot, reference_id, binding_id,
                         catalogue_voice_id, binding_resolution_status,
                         capability_id, capability_name_snapshot, provider,
                         provider_region, provider_voice_id, model_id, tier,
                         language, raw_text, spoken_text, tagged_text, delivery,
                         segmentation, usage, cost, cost_basis, diagnostics,
                         filename, path, size_bytes, duration_ms, snapshot)
                    SELECT %s, 1, %s, voice_identity_id,
                           voice_name_snapshot, reference_id, binding_id,
                           catalogue_voice_id, binding_resolution_status,
                           capability_id, capability_name_snapshot, provider,
                           provider_region, provider_voice_id, model_id, tier,
                           language, raw_text, spoken_text, tagged_text, delivery,
                           segmentation, usage, 0, 'reused', diagnostics,
                           %s, path, size_bytes, duration_ms, snapshot
                      FROM clips WHERE id=%s RETURNING id
                """, (new_id, script_hash(row[5]), filename or "", row[10]))
                cursor.fetchone()
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
                SELECT filename FROM clips WHERE part_id=ANY(%s) AND filename<>''
            """, (ids,))
            files = [row[0] for row in cursor.fetchall()]
            cursor.execute("""
                UPDATE production_parts
                   SET archived_position=position, position=NULL,
                       archived_at=now(), updated_at=now()
                 WHERE id=ANY(%s)
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
            if not self._production_exists(
                    cursor, destination_production_id, lock=True):
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
