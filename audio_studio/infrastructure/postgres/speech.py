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
                       provider_model.adapter_key,
                       coalesce(jsonb_agg(jsonb_build_object(
                           'id', capability.id, 'name', capability.name
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
                       binding.provider_region, provider_model.adapter_key
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
                "capabilities": row[13] or [],
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
            cursor.execute("""
                SELECT part.id, part.created_at, part.kind, part.title,
                       part.script, part.revision, part.selected_take_id,
                       draft.state, take.provider_voice_id,
                       take.voice_identity_id, take.provider, take.model_id,
                       take.tier, take.language, take.delivery,
                       take.raw_text, take.spoken_text, take.tagged_text,
                       take.binding_id, take.catalogue_voice_id,
                       take.capability_id, take.snapshot, role.public_id
                  FROM production_parts part
             LEFT JOIN composition_drafts draft ON draft.part_id = part.id
             LEFT JOIN takes take ON take.id = part.selected_take_id
             LEFT JOIN production_cast_roles role ON role.id=part.cast_role_id
                 WHERE part.id = %s AND part.production_id = %s
                   AND part.archived_at IS NULL
            """, (part_id, production_id))
            row = cursor.fetchone()
        if not row:
            return None
        draft = row[7] or {}
        take_snapshot = row[21] or {}
        delivery = row[14] or {}
        return {
            "id": row[0], "created_at": row[1], "kind": row[2],
            "title": row[3], "text": row[4], "revision": row[5],
            "selected_take_id": row[6],
            "text_raw": draft.get("text_raw", row[15]),
            "text_shaped": draft.get("text_shaped", row[16]),
            "text_tagged": draft.get("text_tagged", row[17]),
            "text_state": draft.get("text_state", "raw"),
            "voice": row[8] or take_snapshot.get("voice", ""),
            "voice_identity_id": row[9],
            "engine": take_snapshot.get("engine", draft.get("engine", "")),
            "model": row[12] or draft.get("model", ""),
            "format": take_snapshot.get("format", draft.get("format", "mp3")),
            "language": row[13] or draft.get("language", "Auto"),
            "instruction": delivery.get("instruction", draft.get("instruction", "")),
            "speech_mode": delivery.get("speech_mode", draft.get("speech_mode", "exact")),
            "rate": delivery.get("rate", draft.get("rate", 1)),
            "pitch": delivery.get("pitch", draft.get("pitch", 1)),
            "volume": delivery.get("volume", draft.get("volume", 50)),
            "seed": delivery.get("seed", draft.get("seed", 0)),
            "binding_id": str(row[18]) if row[18] else draft.get("binding_id"),
            "catalogue_voice_id": row[19] or draft.get("catalogue_voice_id"),
            "capability_id": row[20] or draft.get("capability_id"),
            "cast_role_id": str(row[22]) if row[22] else None,
        }

    def cast_assignment(self, production_id: int, role_id: str, *,
                        voice_identity_id: str | None,
                        catalogue_voice_id: str | None) -> dict:
        with read_only() as cursor:
            cursor.execute("""
                SELECT role.assignment_revision, role.name,
                       persona.id, persona.name, role.voice_source_kind,
                       role.voice_identity_id, role.catalogue_voice_id
                  FROM production_cast_roles role
             LEFT JOIN personas persona ON persona.id=role.persona_id
                 WHERE role.public_id=%s AND role.production_id=%s
            """, (role_id, production_id))
            row = cursor.fetchone()
        if not row:
            raise ValueError("That Cast Role does not belong to this Production.")
        if row[4] == "identity" and row[5] != voice_identity_id:
            raise ValueError(
                "The exact binding does not belong to this Cast Role's voice.")
        if row[4] == "catalogue" and row[6] != catalogue_voice_id:
            raise ValueError(
                "The exact catalogue voice does not match this Cast Role.")
        return {
            "assignment_revision": int(row[0] or 1),
            "cast_role_name": row[1] or "",
            "persona_id": row[2], "persona_name": row[3] or "",
        }

    def create_part(self, production_id: int | None, insert_at: int | None,
                    values: dict[str, Any]) -> int | None:
        if production_id is None:
            # Standalone Speak history is the durable Job/ProviderAttempt.  It
            # must not manufacture a fake Production Part.
            return None
        with transaction() as cursor:
            cursor.execute("SELECT id FROM productions WHERE id = %s AND archived_at IS NULL FOR UPDATE",
                           (production_id,))
            if not cursor.fetchone():
                raise LookupError("That Production no longer exists.")
            cursor.execute("SELECT coalesce(max(position), -1) + 1 FROM production_parts WHERE production_id = %s AND archived_at IS NULL",
                           (production_id,))
            next_position = int(cursor.fetchone()[0] or 0)
            position = next_position if insert_at is None else max(0, min(int(insert_at), next_position))
            cursor.execute("UPDATE production_parts SET position = position + 1 WHERE production_id = %s AND archived_at IS NULL AND position >= %s",
                           (production_id, position))
            canonical_script = str(values.get("text_raw") or
                                   values.get("text") or "")
            cursor.execute("""
                INSERT INTO production_parts
                    (production_id, position, kind, script, title,
                     cast_role_id, editorial_status, revision)
                SELECT %s, %s, 'speech', %s, %s, role.id, 'ready',
                       CASE WHEN coalesce(role.assignment_revision,0)=%s
                            THEN 1 ELSE 2 END
                  FROM (SELECT %s::uuid AS public_id) wanted
             LEFT JOIN production_cast_roles role
                    ON role.public_id=wanted.public_id
                   AND role.production_id=%s
                RETURNING id
            """, (production_id, position, canonical_script,
                  values.get("title") or "",
                  int((values.get("_cast_snapshot") or {}).get(
                      "assignment_revision") or 0),
                  values.get("cast_role_id"),
                  production_id))
            part_id = int(cursor.fetchone()[0])
            take_id = self._insert_take(
                cursor, part_id, 1, values,
                canonical_script=canonical_script)
            cursor.execute("""
                UPDATE production_parts SET selected_take_id=%s
                 WHERE id=%s AND revision=1
            """, (take_id, part_id))
            return part_id

    def replace_part(self, part_id: int, production_id: int,
                     expected_created_at, values: dict[str, Any], *,
                     operation: str) -> dict[str, int]:
        with transaction() as cursor:
            cursor.execute("""
                SELECT revision, kind, script FROM production_parts
                 WHERE id = %s AND production_id = %s
                   AND archived_at IS NULL FOR UPDATE
            """, (part_id, production_id))
            current = cursor.fetchone()
            if not current:
                raise LookupError("That Part no longer belongs to this Production.")
            current_revision = int(current[0])
            kind = str(current[1] or "")
            if operation == "render_draft" and kind != "draft":
                raise ValueError("That Draft has already been recorded.")
            if operation == "regenerate" and kind not in {"audio", "speech"}:
                raise ValueError("Only recorded speech can receive another Take.")
            take_id = self._insert_take(
                cursor, part_id, int(expected_created_at), values,
                canonical_script=str(current[2] or ""))
            selected = current_revision == int(expected_created_at)
            if selected:
                cursor.execute("""
                    UPDATE production_parts
                       SET selected_take_id = %s, kind = 'speech',
                           editorial_status = 'ready', updated_at = now()
                     WHERE id = %s
                """, (take_id, part_id))
                cursor.execute("DELETE FROM composition_drafts WHERE part_id = %s",
                               (part_id,))
            stale = 0
            if operation == "regenerate" and selected:
                cursor.execute("""
                    UPDATE transcripts SET stale = true
                     WHERE part_id = %s AND stale = false
                """, (part_id,))
                stale = cursor.rowcount
            cursor.execute("SELECT count(*) FROM takes WHERE part_id = %s",
                           (part_id,))
            takes = int(cursor.fetchone()[0] or 0)
            return {"takes": takes, "subtitles_stale": stale,
                    "selected": int(selected), "take_id": take_id}

    @staticmethod
    def _insert_take(cursor, part_id: int, source_revision: int,
                     values: dict[str, Any], *,
                     canonical_script: str | None = None) -> int:
        spoken_script = str(values.get("text") or "")
        canonical_script = (spoken_script if canonical_script is None
                            else canonical_script)
        cursor.execute("""
            SELECT role.id, role.name, role.assignment_revision,
                   persona.id, persona.name
              FROM production_parts part
         LEFT JOIN production_cast_roles role ON role.id=part.cast_role_id
         LEFT JOIN personas persona ON persona.id=role.persona_id
             WHERE part.id=%s
        """, (part_id,))
        cast = cursor.fetchone() or (None, None, 0, None, None)
        expected_cast = values.get("_cast_snapshot") or {}
        snapshot = {
            "engine": values.get("engine"), "format": values.get("format"),
            "voice": values.get("provider_voice_id") or values.get("voice"),
            "text_state": values.get("text_state"),
        }
        cursor.execute("""
            INSERT INTO takes
                (part_id, source_part_revision, source_script_hash,
                 cast_assignment_revision, persona_id, persona_name_snapshot,
                 cast_role_id, cast_role_name_snapshot,
                 voice_identity_id, voice_name_snapshot, reference_id,
                 binding_id, catalogue_voice_id, binding_resolution_status,
                 capability_id, capability_name_snapshot, provider,
                 provider_region, provider_voice_id, model_id, tier, language,
                 raw_text, spoken_text, tagged_text, delivery, segmentation,
                 usage, cost, cost_basis, diagnostics, filename, path,
                 size_bytes, duration_ms, snapshot, provider_attempt_id)
            VALUES
                (%s, %s, %s, %s, %s, %s, %s, %s,
                 %s, %s, %s, %s, %s, %s, %s, %s,
                 %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb,
                 %s::jsonb, %s::jsonb, %s, %s, %s::jsonb, %s, %s, %s, %s,
                 %s::jsonb, %s)
            RETURNING id
        """, (
            part_id, source_revision,
            hashlib.sha256(canonical_script.encode("utf-8")).hexdigest(),
            int(expected_cast.get("assignment_revision", cast[2] or 0)),
            expected_cast.get("persona_id", cast[3]),
            expected_cast.get("persona_name", cast[4]), cast[0],
            expected_cast.get("cast_role_name", cast[1]),
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
                        ("instruction", "speech_mode", "rate", "pitch", "volume", "seed")}),
            json.dumps(values.get("segmentation") or {}),
            json.dumps(values.get("usage") or {}), values.get("cost") or 0,
            values.get("cost_basis") or "unknown",
            json.dumps(values.get("diagnostics") or {}), values.get("filename") or "",
            values.get("path") or "", values.get("size_bytes") or 0,
            values.get("duration_ms"), json.dumps(snapshot),
            values.get("provider_attempt_id"),
        ))
        return int(cursor.fetchone()[0])
