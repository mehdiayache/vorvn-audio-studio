"""PostgreSQL reads shared by native speech-producing capabilities."""

from __future__ import annotations

import json
import hashlib
from typing import Any

from audio_studio.infrastructure.postgres.session import read_only, transaction
from audio_studio.infrastructure.postgres.provider_catalogue import (
    ProviderCatalogueRepository,
)
from audio_studio.infrastructure.postgres.spend import today_provider_spend


class SpeechRepository:
    def voice_bindings(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT binding.id, binding.provider_voice_id, binding.model_id,
                       binding.engine, binding.tier, binding.status,
                       binding.languages, identity.id, identity.name,
                       binding.reference_id, binding.provider,
                       binding.provider_region,
                       provider_model.adapter_key,provider_model.pricing,
                       coalesce(jsonb_agg(jsonb_build_object(
                           'id', capability.id, 'name', capability.name,
                           'description', capability.description,
                           'controls', capability.controls,
                           'ui_metadata', capability.ui_metadata
                       )) FILTER (WHERE capability.id IS NOT NULL), '[]'::jsonb)
                  FROM voice_bindings binding
                  JOIN voice_identities identity
                    ON identity.id = binding.identity_id
             LEFT JOIN provider_models provider_model
                    ON provider_model.id=binding.provider_model_id
             LEFT JOIN provider_model_capabilities model_capability
                    ON model_capability.provider_model_id = binding.provider_model_id
             LEFT JOIN capabilities capability
                    ON capability.id = model_capability.capability_id
                 WHERE binding.source = 'custom'
                   AND identity.status = 'active'
                   AND binding.archived_at IS NULL
                   AND binding.status NOT IN
                       ('deleted', 'undeployed', 'failed', 'archived')
              GROUP BY binding.id, binding.provider_voice_id, binding.model_id,
                       binding.engine, binding.tier, binding.status,
                       binding.languages, identity.id, identity.name,
                       binding.reference_id, binding.provider,
                       binding.provider_region, provider_model.adapter_key,
                       provider_model.pricing
                 ORDER BY identity.name, binding.model_id, binding.created_at
            """)
            custom = [{
                "binding_id": str(row[0]), "provider_voice_id": row[1],
                "voice_id": row[1], "model_id": row[2], "target_model": row[2],
                "engine": row[3], "tier": row[4], "status": row[5],
                "languages": row[6] or [], "identity_id": row[7],
                "name": row[8], "reference_id": row[9],
                "source": "custom", "provider": row[10], "region": row[11],
                "adapter_key": row[12] or row[3],
                "estimate_rate_per_million_chars": float(
                    (row[13] or {}).get("speech_per_million_chars") or 0),
                "capabilities": row[14] or [],
            } for row in cursor.fetchall()]
        return custom

    def catalogue_voices(self) -> list[dict]:
        """Return exact, stable catalogue routes; never mix them with our voices."""
        return ProviderCatalogueRepository().bindings()

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
        return today_provider_spend()

    def part(self, part_id: int, production_id: int) -> dict[str, Any] | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT part.id, part.created_at, part.kind, part.title,
                       part.script, part.revision, clip.id,
                       draft.state, clip.provider_voice_id,
                       clip.voice_identity_id, clip.provider, clip.model_id,
                       clip.tier, clip.language, clip.delivery,
                       clip.raw_text, clip.spoken_text, clip.tagged_text,
                       clip.binding_id, clip.catalogue_voice_id,
                       clip.capability_id, clip.snapshot
                  FROM production_parts part
             LEFT JOIN composition_drafts draft ON draft.part_id = part.id
             LEFT JOIN clips clip ON clip.part_id = part.id
                 WHERE part.id = %s AND part.production_id = %s
                   AND part.archived_at IS NULL
            """, (part_id, production_id))
            row = cursor.fetchone()
        if not row:
            return None
        draft = row[7] or {}
        clip_snapshot = row[21] or {}
        delivery = row[14] or {}
        return {
            "id": row[0], "created_at": row[1], "kind": row[2],
            "title": row[3], "text": row[4], "revision": row[5],
            "clip_id": row[6],
            "text_raw": draft.get("text_raw", row[15]),
            "text_shaped": draft.get("text_shaped", row[16]),
            "text_tagged": draft.get("text_tagged", row[17]),
            "text_state": draft.get("text_state", "raw"),
            "voice": row[8] or clip_snapshot.get("voice", ""),
            "voice_identity_id": row[9],
            "engine": clip_snapshot.get("engine", draft.get("engine", "")),
            "model": row[12] or draft.get("model", ""),
            "format": clip_snapshot.get("format", draft.get("format", "mp3")),
            "language": row[13] or draft.get("language", "Auto"),
            "instruction": delivery.get("instruction", draft.get("instruction", "")),
            "speech_mode": delivery.get("speech_mode", draft.get("speech_mode", "exact")),
            "rate": delivery.get("rate", draft.get("rate", 1)),
            "pitch": delivery.get("pitch", draft.get("pitch", 1)),
            "volume": delivery.get("volume", draft.get("volume", 50)),
            "seed": delivery.get("seed", draft.get("seed", 0)),
            "enable_ssml": bool(delivery.get(
                "enable_ssml", draft.get("enable_ssml", False))),
            "binding_id": str(row[18]) if row[18] else draft.get("binding_id"),
            "catalogue_voice_id": row[19] or draft.get("catalogue_voice_id"),
            "capability_id": row[20] or draft.get("capability_id"),
        }

    def attach_clip(self, part_id: int, production_id: int,
                    expected_revision: int,
                    values: dict[str, Any]) -> dict[str, Any]:
        with transaction() as cursor:
            cursor.execute("""
                SELECT revision, kind, script,
                       (SELECT clip.id FROM clips clip WHERE clip.part_id = production_parts.id),
                       (SELECT clip.filename FROM clips clip WHERE clip.part_id = production_parts.id)
                  FROM production_parts
                 WHERE id = %s AND production_id = %s
                   AND archived_at IS NULL FOR UPDATE
            """, (part_id, production_id))
            current = cursor.fetchone()
            if not current:
                raise LookupError("That Part no longer belongs to this Production.")
            current_revision = int(current[0])
            kind = str(current[1] or "")
            if kind not in {"draft", "speech"}:
                raise ValueError("That Part cannot contain speech.")
            if current_revision != int(expected_revision):
                return {"subtitles_stale": 0, "attached": 0}
            previous_clip_id = current[3]
            replaced_filename = str(current[4] or "")
            subtitles_stale = 0
            if previous_clip_id is not None:
                cursor.execute("""
                    UPDATE transcripts SET stale=true
                     WHERE part_id=%s AND stale=false
                """, (part_id,))
                subtitles_stale = cursor.rowcount
                cursor.execute("DELETE FROM clips WHERE id=%s",
                               (previous_clip_id,))
            clip_id = self._insert_clip(
                cursor, part_id, int(expected_revision), values,
                canonical_script=str(current[2] or ""),
                source_script_hash=values.get("_source_script_hash"))
            cursor.execute("""
                UPDATE production_parts
                   SET kind = 'speech', editorial_status = 'ready',
                       updated_at = now()
                 WHERE id = %s
            """, (part_id,))
            cursor.execute("DELETE FROM composition_drafts WHERE part_id = %s",
                           (part_id,))
            return {"subtitles_stale": subtitles_stale, "attached": 1,
                    "clip_id": clip_id,
                    "replaced_filename": replaced_filename}

    @staticmethod
    def _insert_clip(cursor, part_id: int, source_revision: int,
                     values: dict[str, Any], *,
                     canonical_script: str | None = None,
                     source_script_hash: str | None = None) -> int:
        spoken_script = str(values.get("text") or "")
        canonical_script = (spoken_script if canonical_script is None
                            else canonical_script)
        snapshot = {
            "engine": values.get("engine"), "format": values.get("format"),
            "voice": values.get("provider_voice_id") or values.get("voice"),
            "text_state": values.get("text_state"),
            "text_raw": values.get("text_raw"),
            "text_shaped": values.get("text_shaped"),
            "text_tagged": values.get("text_tagged"),
            "spoken_profile": values.get("spoken_profile") or "spoken_1",
        }
        cursor.execute("""
            INSERT INTO clips
                (part_id, source_part_revision, source_script_hash,
                 voice_identity_id, voice_name_snapshot, reference_id,
                 binding_id, catalogue_voice_id, binding_resolution_status,
                 capability_id, capability_name_snapshot, provider,
                 provider_region, provider_voice_id, model_id, tier, language,
                 raw_text, spoken_text, tagged_text, delivery, segmentation,
                 usage, cost, cost_basis, diagnostics, filename, path,
                 size_bytes, duration_ms, snapshot, provider_attempt_id,
                 start_time_ms, file_url)
            VALUES
                (%s, %s, %s, %s, %s, %s, %s, %s,
                 %s, %s, %s, %s, %s, %s, %s, %s,
                 %s, %s, %s, %s, %s::jsonb,
                 %s::jsonb, %s::jsonb, %s, %s, %s::jsonb, %s, %s, %s, %s,
                 %s::jsonb, %s, 0, %s)
            RETURNING id
        """, (
            part_id, source_revision,
            source_script_hash or hashlib.sha256(
                canonical_script.encode("utf-8")).hexdigest(),
            values.get("voice_identity_id"), values.get("voice_name") or values.get("voice"),
            values.get("reference_id"), values.get("binding_id"),
            values.get("catalogue_voice_id"),
            ("resolved" if values.get("binding_id") or
             values.get("catalogue_voice_id") else "unresolved"),
            values.get("capability_id"),
            values.get("capability_name"), values.get("provider"),
            values.get("provider_region"), values.get("provider_voice_id") or values.get("voice"),
            values.get("model_id"), values.get("tier") or values.get("model"),
            values.get("language"), values.get("text_raw"),
            values.get("text_shaped") or spoken_script, values.get("text_tagged"),
            json.dumps({key: values.get(key) for key in
                        ("instruction", "speech_mode", "rate", "pitch", "volume", "seed",
                         "enable_ssml")}),
            json.dumps(values.get("segmentation") or {}),
            json.dumps(values.get("usage") or {}), values.get("cost") or 0,
            values.get("cost_basis") or "unknown",
            json.dumps(values.get("diagnostics") or {}), values.get("filename") or "",
            values.get("path") or "", values.get("size_bytes") or 0,
            values.get("duration_ms"), json.dumps(snapshot),
            values.get("provider_attempt_id"),
            values.get("file_url") or f"/audio/{values.get('filename') or ''}",
        ))
        return int(cursor.fetchone()[0])
