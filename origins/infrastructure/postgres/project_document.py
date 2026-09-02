"""Canonical PostgreSQL persistence for an editable Project document.

Parts own editorial intent. The internal recording snapshot owns generated
performance facts. Provider settings are exposed from that active snapshot
shape; they are never written back onto the Part.
"""

from __future__ import annotations

from hashlib import sha256
import json
from typing import Any

from origins.domain.speech import DEFAULT_SPEECH_VOLUME
from origins.infrastructure.postgres.session import read_only, transaction
from origins.infrastructure.postgres.part_positions import (
    release_archived_positions,
)




def script_hash(value: str) -> str:
    return sha256((value or "").encode()).hexdigest()


def _float(value, default: float = 0) -> float:
    return float(value if value is not None else default)


def _int(value, default: int = 0) -> int:
    return int(value if value is not None else default)


class ProjectDocumentRepository:
    """Own stable Parts, one recording snapshot and background-music state."""

    @staticmethod
    def _project_exists(
        cursor, project_id: int, *, lock: bool = False,
    ) -> bool:
        cursor.execute(
            "SELECT 1 FROM projects WHERE id=%s AND project_type='audiovisual'"
            + (" FOR UPDATE" if lock else ""),
            (project_id,),
        )
        return cursor.fetchone() is not None

    @staticmethod
    def _part_row(cursor, project_id: int, part_id: int, *, lock=False):
        cursor.execute("""
            SELECT id, public_id, project_id, position, kind, script, title,
                   NULL::bigint, editorial_status, revision,
                   (SELECT clip.id FROM clips clip WHERE clip.part_id = project_parts.id),
                   file_id, file_version_id, duration_ms, created_at, updated_at,
                   enabled, authored_role
              FROM project_parts
             WHERE id = %s AND project_id = %s AND archived_at IS NULL
        """ + (" FOR UPDATE" if lock else ""), (part_id, project_id))
        return cursor.fetchone()

    @staticmethod
    def _next_position(cursor, project_id: int) -> int:
        cursor.execute("""
            SELECT coalesce(max(position), -1) + 1
              FROM project_parts
             WHERE project_id = %s AND archived_at IS NULL
        """, (project_id,))
        return int(cursor.fetchone()[0])

    def part_snapshot(self, part_id: int) -> dict[str, Any] | None:
        """Return a Part together with its active recording facts, if present."""
        with read_only() as cursor:
            cursor.execute("""
                SELECT part.id, part.created_at, part.position, part.kind,
                       part.title, part.script, part.revision, part.editorial_status,
                       clip.snapshot, clip.filename, clip.path, clip.size_bytes,
                       clip.duration_ms, clip.cost, clip.language, clip.usage,
                       clip.cost_basis, clip.diagnostics, clip.voice_identity_id,
                       clip.provider_voice_id, clip.model_id, clip.tier,
                       part.project_id
                  FROM project_parts part
                  LEFT JOIN clips clip ON clip.part_id = part.id
                 WHERE part.id = %s AND part.archived_at IS NULL
            """, (part_id,))
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
            "volume": _int(snapshot.get("volume"), DEFAULT_SPEECH_VOLUME),
            "seed": int(snapshot.get("seed") or 0),
            "project_id": row[22],
        }

    def part(self, project_id: int, part_id: int) -> dict[str, Any] | None:
        with read_only() as cursor:
            row = self._part_row(cursor, project_id, part_id)
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
            "project_id": row[2], "position": row[3], "kind": row[4],
            "text": row[5], "title": row[6],
            "editorial_status": row[8], "revision": row[9],
            "clip_id": row[10], "file_id": row[11],
            "file_version_id": row[12], "duration_ms": row[13],
            "created_at": row[14], "updated_at": row[15],
            "enabled": bool(row[16]),
            "authored_role": row[17],
            "filename": clip[0] if clip else "",
            "voice": (clip[1] or (clip[3] or {}).get("voice")) if clip else "",
            "voice_name": (clip[4] or (clip[3] or {}).get("voice_name")) if clip else "",
            "voice_identity_id": clip[2] if clip else None,
        }

    def parts(self, project_id: int) -> list[dict[str, Any]]:
        """Return Parts plus a read-only projection of the active recording."""
        with read_only() as cursor:
            cursor.execute("""
                SELECT part.id, part.public_id, part.created_at, part.position,
                       part.kind, part.title, part.script, NULL::uuid,
                       NULL::text, part.editorial_status, part.revision,
                       clip.id, part.file_id,
                       part.file_version_id, part.duration_ms,
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
                       file.kind, file.category,
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
                  FROM project_parts part
                  LEFT JOIN composition_drafts draft ON draft.part_id = part.id
                  LEFT JOIN clips clip ON clip.part_id = part.id
                  LEFT JOIN provider_attempts attempt
                    ON attempt.id = clip.provider_attempt_id
                  LEFT JOIN file_versions version ON version.id = part.file_version_id
                  LEFT JOIN files file ON file.id = part.file_id
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
                       AND ((clip.id IS NOT NULL AND transcript.clip_id = clip.id)
                         OR (clip.id IS NULL AND transcript.clip_id IS NULL))
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
                 WHERE part.project_id = %s AND part.archived_at IS NULL
                 ORDER BY part.position NULLS LAST, part.created_at, part.id
            """, (project_id,))
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
            recording_text_state = (
                snapshot.get("text_state") if has_clip else None)
            if has_clip:
                recording_raw = (snapshot.get("text_raw") or row[61]
                                 or row[6] or "")
                recording_tagged = snapshot.get("text_tagged") or row[63]
                recording_shaped = snapshot.get("text_shaped")
                if not recording_shaped and recording_text_state == "shaped":
                    recording_shaped = row[62]
                elif (not recording_shaped
                      and recording_text_state == "tagged"
                      and row[62] and row[62] != row[63]):
                    recording_shaped = row[62]
            else:
                recording_raw = draft.get("text_raw")
                recording_shaped = draft.get("text_shaped")
                recording_tagged = draft.get("text_tagged")
            item = {
                "id": row[0], "public_id": str(row[1]),
                "created_at": row[2].isoformat(), "position": row[3],
                "kind": row[4], "title": row[5] or None,
                "text": row[6],
                "editorial_status": row[9],
                "revision": row[10], "clip_id": row[11],
                "recording_text_state": recording_text_state,
                "outdated": bool(row[11] and (
                    clip_revision != row[10]
                    or row[52] != script_hash(row[6]))),
                "file_id": row[12], "file_version_id": row[13],
                "duration_ms": row[27] if row[11] else row[14],
                "text_raw": recording_raw,
                "text_shaped": recording_shaped,
                "text_tagged": recording_tagged,
                "text_state": (recording_text_state
                               or draft.get("text_state", "raw")),
                "spoken_profile": (job_payload.get("spoken_profile")
                                   if has_clip else
                                   draft.get("spoken_profile")
                                   or job_payload.get("spoken_profile")
                                   or "spoken_1"),
                "voice_identity_id": (row[18] if has_clip else
                                      draft.get("voice_identity_id") or job_payload.get("voice_identity_id")),
                "voice": ((row[19] or snapshot.get("voice") or "") if has_clip else
                          job_payload.get("voice", "")),
                "voice_name": ((row[53] or snapshot.get("voice_name") or "") if has_clip else
                               job_payload.get("voice_name", "")),
                "clip_public_id": str(row[54]) if row[54] else None,
                "reference_id": row[55],
                "provider": ((row[56] or snapshot.get("provider")) if has_clip else
                             job_payload.get("provider")),
                "provider_region": ((row[57] or snapshot.get("provider_region")) if has_clip else
                                    job_payload.get("provider_region")),
                "tier": ((row[58] or snapshot.get("tier")) if has_clip else
                         job_payload.get("model")),
                "provider_attempt_id": str(row[59]) if row[59] else None,
                "provider_attempt_status": row[60],
                "clip_raw_text": row[61],
                "clip_spoken_text": row[62],
                "clip_tagged_text": row[63],
                "clip_delivery": row[64] or {},
                "clip_usage": row[65] or {},
                "clip_segmentation": row[66] or {},
                "binding_resolution_status": row[67],
                "file_kind": row[68],
                "file_category": row[69],
                "engine": (snapshot.get("engine") if has_clip else
                           job_payload.get("engine")),
                "model": ((row[20] or snapshot.get("model")) if has_clip else
                          job_payload.get("model")),
                "format": snapshot.get("format") or draft.get("format") or job_payload.get("format", "mp3"),
                "language": ((row[22] or snapshot.get("language")) if has_clip else
                             draft.get("language") or job_payload.get("language")),
                "instruction": delivery.get("instruction", draft.get("instruction", job_payload.get("instruction", ""))),
                "speech_mode": delivery.get("speech_mode", snapshot.get("speech_mode", draft.get("speech_mode", job_payload.get("speech_mode", "exact")))),
                "rate": _float(delivery.get("rate", snapshot.get("rate", draft.get("rate", job_payload.get("rate")))), 1),
                "pitch": _float(delivery.get("pitch", snapshot.get("pitch", draft.get("pitch", job_payload.get("pitch")))), 1),
                "volume": _int(delivery.get("volume", snapshot.get("volume", draft.get("volume", job_payload.get("volume")))), DEFAULT_SPEECH_VOLUME),
                "seed": _int(delivery.get("seed", snapshot.get("seed", draft.get("seed", job_payload.get("seed")))), 0),
                "enable_ssml": bool(delivery.get("enable_ssml", snapshot.get(
                    "enable_ssml", draft.get("enable_ssml", job_payload.get(
                        "enable_ssml", False))))),
                "filename": row[24] or row[34] or "",
                "size_bytes": int(row[25] or 0), "cost": _float(row[26]),
                "spent": _float(row[33]), "cost_basis": row[28],
                "capability_id": ((row[31] or snapshot.get("capability_id")) if has_clip else
                                 draft.get("capability_id")
                                 or job_payload.get("capability_id")),
                "capability_name": ((row[82] or snapshot.get("capability_name")) if has_clip else
                                   job_payload.get("capability_name")),
                "binding_id": ((str(row[39]) if row[39] else None) if has_clip else
                               draft.get("binding_id")
                               or job_payload.get("binding_id")),
                "catalogue_voice_id": (row[40] if has_clip else
                                       draft.get("catalogue_voice_id")
                                       or job_payload.get("catalogue_voice_id")),
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
                        for key in ("part_id", "project_id", "language")
                        if caption_payload.get(key) is not None
                    },
                }
            if item["kind"] == "file":
                item["missing"] = not bool(row[34])
                item["duration_ms"] = row[35] or item["duration_ms"]
            result.append(item)
        return result

    def next_position(self, project_id: int) -> int:
        with read_only() as cursor:
            return self._next_position(cursor, project_id)

    def create_part(self, project_id: int, values: dict[str, Any],
                    before_part_public_id: str | None = None) -> int | None:
        with transaction() as cursor:
            if not self._project_exists(cursor, project_id, lock=True):
                return None
            release_archived_positions(cursor, project_id)
            next_position = self._next_position(cursor, project_id)
            if before_part_public_id:
                cursor.execute("""
                    SELECT position FROM project_parts
                     WHERE public_id=%s AND project_id=%s
                       AND archived_at IS NULL FOR UPDATE
                """, (before_part_public_id, project_id))
                anchor = cursor.fetchone()
                if not anchor:
                    raise ValueError(
                        "The selected insertion point no longer exists.")
                position = int(anchor[0])
            else:
                position = next_position
            if position < next_position:
                cursor.execute("""
                    UPDATE project_parts SET position = position + 1,
                           updated_at = now()
                     WHERE project_id = %s AND archived_at IS NULL
                       AND position >= %s
                """, (project_id, position))
            raw_kind = str(values.get("kind") or "speech")
            kind = "speech" if raw_kind in {"audio", "speech"} else raw_kind
            script = str(values.get("text") or "")
            cursor.execute("""
                INSERT INTO project_parts
                    (project_id, position, kind, script, title,
                     editorial_status, file_id, file_version_id, duration_ms,
                     authored_role)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (project_id, position, kind, script,
                  str(values.get("title") or ""),
                  "draft" if kind == "draft" else "ready",
                  values.get("file_id"), values.get("file_version_id"),
                  values.get("duration_ms"), values.get("authored_role")))
            part_id = int(cursor.fetchone()[0])
            if kind == "draft":
                cursor.execute("""
                    INSERT INTO composition_drafts (part_id, project_id, state)
                    VALUES (%s, %s, %s::jsonb)
                """, (part_id, project_id, json.dumps(values)))
            return part_id

    def import_parts(
        self, project_id: int, items: list[dict[str, Any]],
        voice_identity_ids: set[str],
        exact_routes: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any] | None:
        """Append one import atomically with optional authored role labels."""
        with transaction() as cursor:
            if not self._project_exists(cursor, project_id, lock=True):
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
            for route in exact_routes or []:
                binding_id = str(route.get("binding_id") or "")
                if not binding_id:
                    raise ValueError(
                        "Project import currently requires an owned Voice binding.")
                cursor.execute("""
                    SELECT binding.identity_id, capability.id
                      FROM voice_bindings binding
                      JOIN voice_identities identity
                        ON identity.id=binding.identity_id
                      JOIN provider_model_capabilities model_capability
                        ON model_capability.provider_model_id=binding.provider_model_id
                      JOIN capabilities capability
                        ON capability.id=model_capability.capability_id
                     WHERE binding.id::text=%s
                       AND binding.identity_id=%s
                       AND capability.id=%s
                       AND binding.source='custom'
                       AND binding.status IN ('active','ready')
                       AND binding.archived_at IS NULL
                       AND identity.status='active'
                """, (binding_id, route.get("identity_id")
                       or route.get("voice_identity_id"),
                       route.get("capability_id")))
                if not cursor.fetchone():
                    raise ValueError(
                        "An exact Voice route changed before import. Reload and choose it again.")
            release_archived_positions(cursor, project_id)
            position = self._next_position(cursor, project_id)
            counts = {"items": len(items), "speech": 0, "silence": 0}
            speech_parts: list[dict[str, Any]] = []
            for offset, values in enumerate(items):
                kind = str(values["kind"])
                cursor.execute("""
                    INSERT INTO project_parts
                        (project_id, position, kind, script, title,
                         editorial_status, duration_ms, authored_role)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    RETURNING id
                """, (
                    project_id, position + offset, kind,
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
                            (part_id, project_id, state)
                        VALUES (%s,%s,%s::jsonb)
                    """, (part_id, project_id, json.dumps(values)))
                    counts["speech"] += 1
                    speech_parts.append({
                        "id": part_id,
                        "text": str(values.get("text") or ""),
                        "capability_id": values.get("capability_id"),
                    })
                else:
                    counts["silence"] += 1
            return {**counts, "speech_parts": speech_parts}

    def insert_file(self, project_id: int, file_id: int,
                     before_part_public_id: str | None = None) -> int | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT file.id, version.id, file.name, version.duration_ms
                  FROM files file
                  JOIN projects project ON project.id = %s
                  JOIN LATERAL (
                    SELECT item.* FROM file_versions item
                     WHERE item.file_id = file.id ORDER BY item.version DESC LIMIT 1
                  ) version ON true
                 WHERE file.id = %s
                   AND file.workspace_id = project.workspace_id
            """, (project_id, file_id))
            row = cursor.fetchone()
        if not row:
            return None
        part_id = self.create_part(project_id, {
            "kind": "file", "text": row[2] or "", "title": row[2] or "",
            "file_id": row[0], "file_version_id": row[1],
            "duration_ms": row[3],
        }, before_part_public_id)
        if part_id is not None:
            with transaction() as cursor:
                cursor.execute("""
                    INSERT INTO project_file_usages (project_id, file_id, purpose)
                    SELECT project.id, file.id, 'script'
                      FROM projects project
                      JOIN files file ON file.id=%s
                     WHERE project.id=%s
                       AND project.project_type='audiovisual'
                       AND project.workspace_id=file.workspace_id
                    ON CONFLICT (project_id, file_id, purpose) DO NOTHING
                """, (file_id, project_id))
        return part_id

    def replace_file(self, project_id: int, part_id: int,
                      file_id: int) -> bool:
        with transaction() as cursor:
            cursor.execute("""
                SELECT version.id, file.name, version.duration_ms
                  FROM files file
                  JOIN projects project ON project.id=%s
                  JOIN LATERAL (
                    SELECT item.* FROM file_versions item
                     WHERE item.file_id=file.id
                     ORDER BY item.version DESC LIMIT 1
                  ) version ON true
                 WHERE file.id=%s
                   AND file.workspace_id=project.workspace_id
            """, (project_id, file_id))
            file = cursor.fetchone()
            if not file:
                return False
            cursor.execute("""
                UPDATE project_parts
                   SET file_id=%s, file_version_id=%s, script=%s, title=%s,
                       duration_ms=%s, revision=revision+1, updated_at=now()
                 WHERE id=%s AND project_id=%s AND kind='file'
                   AND archived_at IS NULL
            """, (file_id, file[0], file[1] or "", file[1] or "",
                  file[2], part_id, project_id))
            updated = cursor.rowcount == 1
            if updated:
                cursor.execute("""
                    INSERT INTO project_file_usages (project_id, file_id, purpose)
                    SELECT project.id, file.id, 'script'
                      FROM projects project
                      JOIN files file ON file.id=%s
                     WHERE project.id=%s
                       AND project.project_type='audiovisual'
                       AND project.workspace_id=file.workspace_id
                    ON CONFLICT (project_id, file_id, purpose) DO NOTHING
                """, (file_id, project_id))
            return updated

    def reorder(self, project_id: int, ordered_ids: list[int]) -> bool:
        ordered_ids = [int(item) for item in ordered_ids]
        if len(ordered_ids) != len(set(ordered_ids)):
            return False
        with transaction() as cursor:
            cursor.execute("""
                SELECT id FROM project_parts
                 WHERE project_id = %s AND archived_at IS NULL
                 ORDER BY position NULLS LAST, created_at, id
                 FOR UPDATE
            """, (project_id,))
            current = [int(row[0]) for row in cursor.fetchall()]
            if any(item not in set(current) for item in ordered_ids):
                return False
            final = ordered_ids + [item for item in current if item not in set(ordered_ids)]
            for position, part_id in enumerate(final):
                cursor.execute("UPDATE project_parts SET position=%s, updated_at=now() WHERE id=%s",
                               (position, part_id))
            return True

    def set_enabled(
        self, project_id: int, part_id: int, enabled: bool,
    ) -> bool:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE project_parts
                   SET enabled=%s, updated_at=now()
                 WHERE id=%s AND project_id=%s AND archived_at IS NULL
            """, (bool(enabled), part_id, project_id))
            return cursor.rowcount == 1

    def save_script(self, project_id: int, part_id: int, script: str,
                    values: dict[str, Any] | None = None) -> bool:
        values = values or {}
        with transaction() as cursor:
            row = self._part_row(cursor, project_id, part_id, lock=True)
            if not row:
                return False
            next_script = str(script)
            next_title = row[6] if "title" not in values else str(values.get("title") or "")
            next_duration = row[13] if "duration_ms" not in values else values["duration_ms"]
            changed = next_script != row[5]
            cursor.execute("""
                UPDATE project_parts
                   SET script=%s, title=%s, duration_ms=%s,
                       revision=revision + %s, updated_at=now()
                 WHERE id=%s
            """, (next_script, next_title, next_duration, 1 if changed else 0, part_id))
            return True

    def save_editorial(self, project_id: int, part_id: int,
                       expected_revision: int,
                       values: dict[str, Any]) -> dict[str, Any] | None:
        """Apply an explicit editorial mutation with optimistic concurrency."""
        with transaction() as cursor:
            row = self._part_row(cursor, project_id, part_id, lock=True)
            if not row:
                return None
            current_revision = int(row[9])
            if current_revision != int(expected_revision):
                return {"status": "conflict", "revision": current_revision}
            next_script = (str(values["script"]) if "script" in values
                           else str(row[5] or ""))
            next_role = (str(values["authored_role"] or "").strip()
                         if "authored_role" in values else row[17])
            changed_fields = []
            if next_script != str(row[5] or ""):
                changed_fields.append("script")
            if next_role != row[17]:
                changed_fields.append("authored_role")
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
            script_changed = "script" in changed_fields
            next_revision = current_revision + int(script_changed)
            cursor.execute("""
                UPDATE project_parts
                   SET script=%s, authored_role=%s, revision=%s,
                       updated_at=now()
                 WHERE id=%s
            """, (next_script, next_role, next_revision, part_id))
            cursor.execute("""
                INSERT INTO audit_records
                    (action, resource_type, resource_id, detail)
                VALUES ('part.editorial_updated','project_part',%s,%s::jsonb)
            """, (str(row[1]), json.dumps({
                "from_revision": current_revision,
                "to_revision": next_revision,
                "changed_fields": changed_fields,
            })))
            selected_outdated = False
            if row[10]:
                cursor.execute(
                    "SELECT source_part_revision, source_script_hash "
                    "FROM clips WHERE id=%s",
                    (row[10],))
                selected = cursor.fetchone()
                selected_outdated = bool(
                    selected and (
                        int(selected[0]) != next_revision
                        or str(selected[1]) != script_hash(next_script)))
            return {"status": "ok", "changed": True,
                    "revision": next_revision,
                    "outdated": selected_outdated}

    def save_draft(self, project_id: int, part_id: int,
                   values: dict[str, Any]) -> bool:
        with transaction() as cursor:
            if not self._part_row(cursor, project_id, part_id, lock=True):
                return False
            cursor.execute("""
                INSERT INTO composition_drafts (part_id, project_id, state)
                VALUES (%s,%s,%s::jsonb)
                ON CONFLICT (part_id) DO UPDATE SET
                    state=composition_drafts.state || EXCLUDED.state,
                    updated_at=now()
            """, (part_id, project_id, json.dumps(values)))
            return True

    def duplicate(self, project_id: int, part_id: int,
                  filename: str = "") -> int | None:
        with transaction() as cursor:
            row = self._part_row(cursor, project_id, part_id, lock=True)
            if not row:
                return None
            release_archived_positions(cursor, project_id)
            position = int(row[3] or 0) + 1
            cursor.execute("""
                UPDATE project_parts SET position=position+1, updated_at=now()
                 WHERE project_id=%s AND archived_at IS NULL AND position >= %s
            """, (project_id, position))
            cursor.execute("""
                INSERT INTO project_parts
                    (project_id, position, kind, script, title,
                     editorial_status, file_id, file_version_id, duration_ms,
                     authored_role)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
            """, (project_id, position, row[4], row[5], row[6],
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

    def delete(self, project_id: int, ids: list[int]) -> list[str] | None:
        """Permanently delete complete Parts and their owned creative state.

        Provider spend remains as content-free Job evidence. Reusable Workspace
        Files are referenced by File Parts, so deleting a placement never
        deletes its library File.
        """
        ids = [int(item) for item in ids]
        with transaction() as cursor:
            cursor.execute("""
                SELECT id, public_id::text, kind
                  FROM project_parts
                 WHERE project_id=%s AND id=ANY(%s) AND archived_at IS NULL FOR UPDATE
            """, (project_id, ids))
            parts = cursor.fetchall()
            if {int(row[0]) for row in parts} != set(ids):
                return None

            part_public_ids = [str(row[1]) for row in parts]
            cursor.execute("""
                SELECT id, part_id, filename, cost, provider_attempt_id
                  FROM clips WHERE part_id=ANY(%s)
            """, (ids,))
            clips = cursor.fetchall()
            clip_ids = [int(row[0]) for row in clips]
            clip_attempt_ids = [int(row[4]) for row in clips if row[4]]
            files = [str(row[2]) for row in clips if row[2]]

            cursor.execute("""
                SELECT DISTINCT job.id
                  FROM jobs job
                 WHERE job.part_id=ANY(%s)
                    OR job.clip_id=ANY(%s)
            """, (ids, clip_ids))
            job_ids = [int(row[0]) for row in cursor.fetchall()]

            if job_ids:
                cursor.execute("""
                    SELECT result->>'name', result->>'filename', result->>'url'
                      FROM jobs WHERE id=ANY(%s)
                """, (job_ids,))
                for row in cursor.fetchall():
                    files.extend(str(value) for value in row if value)
                cursor.execute("""
                    DELETE FROM transcripts
                     WHERE part_id=ANY(%s) OR clip_id=ANY(%s)
                        OR source_job_id=ANY(%s)
                """, (ids, clip_ids, job_ids))
                cursor.execute("DELETE FROM job_events WHERE job_id=ANY(%s)",
                               (job_ids,))
                cursor.execute("""
                    UPDATE provider_attempts
                       SET error='{}'::jsonb, diagnostics='{}'::jsonb
                     WHERE job_id=ANY(%s) OR id=ANY(%s)
                """, (job_ids, clip_attempt_ids))
                cursor.execute("""
                    UPDATE jobs
                       SET part_id=NULL, clip_id=NULL, payload='{}'::jsonb,
                           result='{}'::jsonb, output_ids='[]'::jsonb,
                           chars=0, detail='Deleted Part activity', error=NULL
                     WHERE id=ANY(%s)
                """, (job_ids,))
            else:
                cursor.execute("""
                    DELETE FROM transcripts
                     WHERE part_id=ANY(%s) OR clip_id=ANY(%s)
                """, (ids, clip_ids))
                if clip_attempt_ids:
                    cursor.execute("""
                        UPDATE provider_attempts
                           SET error='{}'::jsonb, diagnostics='{}'::jsonb
                         WHERE id=ANY(%s)
                    """, (clip_attempt_ids,))

            cursor.execute("""
                DELETE FROM audit_records
                 WHERE resource_type='project_part'
                   AND resource_id=ANY(%s)
            """, (part_public_ids,))
            cursor.execute("DELETE FROM project_parts WHERE id=ANY(%s)",
                           (ids,))
            cursor.execute("""
                WITH ranked AS (
                    SELECT id, row_number() OVER (ORDER BY position, created_at, id)-1 AS next
                      FROM project_parts
                     WHERE project_id=%s AND archived_at IS NULL)
                UPDATE project_parts part SET position=ranked.next, updated_at=now()
                  FROM ranked WHERE part.id=ranked.id
            """, (project_id,))
            return list(dict.fromkeys(files))

    def move(self, source_project_id: int, ids: list[int],
             destination_project_id: int) -> bool:
        ids = [int(item) for item in ids]
        with transaction() as cursor:
            if not self._project_exists(
                    cursor, destination_project_id, lock=True):
                return False
            cursor.execute("""
                SELECT id FROM project_parts
                 WHERE project_id=%s AND id=ANY(%s) AND archived_at IS NULL FOR UPDATE
            """, (source_project_id, ids))
            if {int(row[0]) for row in cursor.fetchall()} != set(ids):
                return False
            start = self._next_position(cursor, destination_project_id)
            for offset, part_id in enumerate(ids):
                cursor.execute("""
                    UPDATE project_parts SET project_id=%s, position=%s,
                           updated_at=now() WHERE id=%s
                """, (destination_project_id, start + offset, part_id))
                cursor.execute("UPDATE composition_drafts SET project_id=%s WHERE part_id=%s",
                               (destination_project_id, part_id))
            cursor.execute("""
                WITH ranked AS (
                    SELECT id, row_number() OVER (ORDER BY position, created_at, id)-1 AS next
                      FROM project_parts
                     WHERE project_id=%s AND archived_at IS NULL)
                UPDATE project_parts part SET position=ranked.next, updated_at=now()
                  FROM ranked WHERE part.id=ranked.id
            """, (source_project_id,))
            return True
