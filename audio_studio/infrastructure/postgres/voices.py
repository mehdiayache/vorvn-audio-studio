"""Canonical PostgreSQL persistence for voice profiles and catalogues."""

from __future__ import annotations

import re

from audio_studio.infrastructure.postgres.session import read_only, transaction
from audio_studio.infrastructure.postgres.provider_catalogue import (
    ProviderCatalogueRepository,
)


_VOICE_PREFIX = re.compile(r"^qwen[\w.-]*?-tts-(?:plus|flash)-", re.I)
_PROFILE_FIELDS = {
    "name", "image", "gender", "age", "accent", "trait", "scene", "notes",
    "recording_language", "editorial_language", "favourite", "status",
}


def voice_key(voice_id: str) -> str:
    """Collapse Plus/Flash provider IDs to their shared catalogue identity."""
    return _VOICE_PREFIX.sub("", voice_id or "").strip()


class VoiceRepository:
    """One persistence owner for voice profiles, bindings and legacy metadata."""

    def catalogue_bindings(self) -> list[dict]:
        return ProviderCatalogueRepository().bindings()

    def profiles(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT identity.id, identity.name, identity.metadata,
                       identity.image, identity.gender, identity.age,
                       identity.accent, identity.trait, identity.scene,
                       identity.notes, identity.recording_language,
                       identity.editorial_language, identity.favourite, identity.status,
                       identity.created_at, identity.updated_at
                  FROM voice_identities identity
                 WHERE EXISTS (
                           SELECT 1 FROM voice_bindings binding
                            WHERE binding.identity_id = identity.id)
                    OR EXISTS (
                           SELECT 1 FROM voice_references reference
                            WHERE reference.identity_id = identity.id)
                    OR EXISTS (
                           SELECT 1 FROM voice_package_jobs package
                            WHERE package.identity_id = identity.id)
                 ORDER BY identity.created_at DESC
            """)
            identities = [{
                "id": row[0], "name": row[1],
                "metadata": {
                    **(row[2] or {}), "image": row[3] or "",
                    "gender": row[4] or "", "age": row[5],
                    "accent": row[6] or "", "trait": row[7] or "",
                    "scene": row[8] or "", "notes": row[9] or "",
                    "recording_language": row[10] or (row[2] or {}).get("language", ""),
                    "language": row[10] or (row[2] or {}).get("language", ""),
                    "editorial_language": row[11] or "",
                    "favourite": bool(row[12]),
                    "status": row[13] or "active",
                },
                "created_at": row[14].isoformat(),
                "updated_at": row[15].isoformat(),
                "references": [], "bindings": [], "jobs": [],
            } for row in cursor.fetchall()]
            by_id = {item["id"]: item for item in identities}

            cursor.execute("""
                SELECT id, identity_id, original_name, normalized_path,
                       source_language, transcript, sha256, duration_ms,
                       sample_rate, channels, metadata, created_at, updated_at,
                       diagnostics
                  FROM voice_references
                 WHERE identity_id IS NOT NULL
                 ORDER BY created_at DESC
            """)
            for row in cursor.fetchall():
                (reference_id, identity_id, name, path, source_language,
                 transcript, sha256, duration_ms, sample_rate, channels,
                 metadata, created_at, updated_at, diagnostics) = row
                if identity_id in by_id:
                    by_id[identity_id]["references"].append({
                        "id": reference_id, "original_name": name or "",
                        "normalized_path": path or "",
                        "source_language": source_language or "",
                        "transcript": transcript or "", "sha256": sha256 or "",
                        "duration_ms": duration_ms, "sample_rate": sample_rate,
                        "channels": channels, "metadata": metadata or {},
                        "diagnostics": diagnostics or {},
                        "created_at": created_at.isoformat(),
                        "updated_at": updated_at.isoformat(),
                    })

            cursor.execute("""
                SELECT provider_voice_id, model_id, identity_id, engine, tier,
                       status, languages, reference_id, created_at
                  FROM voice_bindings ORDER BY created_at
            """)
            for row in cursor.fetchall():
                (provider_id, model_id, identity_id, engine, tier, status,
                 languages, reference_id, created_at) = row
                if identity_id in by_id:
                    by_id[identity_id]["bindings"].append({
                        "provider_voice_id": provider_id, "model_id": model_id,
                        "engine": engine, "tier": tier, "status": status,
                        "languages": languages or [],
                        "reference_id": reference_id,
                        "created_at": created_at.isoformat(),
                    })

            cursor.execute("""
                SELECT id, identity_id, reference_id, model_id, engine, tier,
                       status, provider_voice_id, error, attempts, updated_at
                  FROM voice_package_jobs ORDER BY created_at
            """)
            job_keys = (
                "id", "identity_id", "reference_id", "model_id", "engine",
                "tier", "status", "provider_voice_id", "error", "attempts",
                "updated_at",
            )
            for row in cursor.fetchall():
                if row[1] in by_id:
                    by_id[row[1]]["jobs"].append(dict(zip(
                        job_keys, (*row[:-1], row[-1].isoformat()))))
        return identities

    def profile_usage(self) -> dict[str, dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT coalesce(take.voice_identity_id,
                                binding.identity_id) AS identity_id,
                       count(*) AS uses,
                       count(DISTINCT part.production_id) AS productions,
                       coalesce(sum(take.cost), 0),
                       max(take.created_at),
                       (array_agg(take.filename
                                  ORDER BY take.created_at DESC)
                           FILTER (WHERE take.filename <> ''))[1]
                  FROM takes take
                  LEFT JOIN production_parts part ON part.id=take.part_id
                  LEFT JOIN voice_bindings binding
                    ON binding.id = take.binding_id
                 WHERE take.provider_voice_id NOT IN ('', '-')
                 GROUP BY coalesce(take.voice_identity_id,
                                   binding.identity_id)
            """)
            rows = cursor.fetchall()
        return {
            row[0]: {
                "uses": row[1], "productions": row[2],
                "spend": float(row[3]),
                "last_used": row[4].isoformat() if row[4] else None,
                "preview_filename": row[5] or "",
            }
            for row in rows if row[0]
        }

    def update_profile(self, identity_id: str, changes: dict) -> bool:
        allowed = {key: changes[key] for key in _PROFILE_FIELDS if key in changes}
        if not allowed:
            return False
        if "name" in allowed:
            allowed["name"] = str(allowed["name"] or "").strip()[:80]
            if not allowed["name"]:
                raise ValueError("A voice name cannot be empty.")
        for key in (
                "image", "gender", "accent", "trait", "scene", "notes",
                "recording_language", "editorial_language", "status"):
            if key in allowed:
                limit = 1000 if key in ("image", "notes") else 160
                allowed[key] = str(allowed[key] or "").strip()[:limit] or None
        if "age" in allowed:
            allowed["age"] = (
                int(allowed["age"])
                if allowed["age"] not in (None, "") else None)
            if allowed["age"] is not None and not 1 <= allowed["age"] <= 120:
                raise ValueError("Age must be between 1 and 120.")
        if "status" in allowed and allowed["status"] not in ("active", "archived"):
            raise ValueError("Voice status must be active or archived.")
        assignments = ", ".join(f"{key} = %s" for key in allowed)
        with transaction() as cursor:
            cursor.execute(
                f"UPDATE voice_identities SET {assignments}, updated_at = now() "
                "WHERE id = %s", [*allowed.values(), identity_id])
            return cursor.rowcount == 1

    def unlinked_history(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT take.provider_voice_id, '', coalesce(max(take.model_id), ''),
                       count(*), count(DISTINCT part.production_id),
                       max(take.created_at),
                       (array_agg(take.filename ORDER BY take.created_at DESC)
                           FILTER (WHERE coalesce(take.filename, '') <> ''))[1]
                  FROM takes take
                  LEFT JOIN production_parts part ON part.id=take.part_id
                 WHERE take.voice_identity_id IS NULL
                   AND take.binding_resolution_status = 'unresolved'
                   AND take.provider_voice_id ~* '^qwen.*-[0-9a-f]{32}$'
                 GROUP BY take.provider_voice_id
                 ORDER BY max(take.created_at) DESC
            """)
            rows = cursor.fetchall()
        return [{
            "provider_voice_id": row[0], "engine": row[1], "model": row[2],
            "uses": int(row[3]), "productions": int(row[4]),
            "last_used": row[5].isoformat() if row[5] else None,
            "preview_filename": row[6] or "",
        } for row in rows]

    def link_history(self, provider_voice_id: str, identity_id: str) -> int:
        provider_voice_id = str(provider_voice_id or "").strip()
        identity_id = str(identity_id or "").strip()
        if not provider_voice_id or not identity_id:
            raise ValueError(
                "A historical provider voice and target identity are required.")
        with transaction() as cursor:
            cursor.execute(
                "SELECT status FROM voice_identities WHERE id = %s FOR UPDATE",
                (identity_id,))
            identity = cursor.fetchone()
            if not identity:
                raise ValueError("That voice identity does not exist.")
            if identity[0] == "archived":
                raise ValueError(
                    "Restore the archived voice before linking history to it.")
            cursor.execute("""
                UPDATE takes SET voice_identity_id = %s,
                       voice_name_snapshot = coalesce(nullif(voice_name_snapshot,''), %s)
                 WHERE provider_voice_id = %s AND voice_identity_id IS NULL
            """, (identity_id, identity_id, provider_voice_id))
            linked = cursor.rowcount
            if linked:
                cursor.execute("""
                    INSERT INTO jobs
                        (kind, status, voice, voice_identity_id,
                         provider_voice_id, detail, cost_basis, source_tool,
                         operation_label, finished_at)
                    VALUES ('voice_history_link', 'ok', %s, %s, %s, %s,
                            'metadata', 'voices', 'Link voice history', now())
                """, (
                    identity_id, identity_id, provider_voice_id,
                    (f"Linked {linked} historical recordings from "
                     f"{provider_voice_id}")[:300],
                ))
            return linked

    def custom_bindings(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT binding.id, binding.provider_voice_id, binding.model_id,
                       binding.engine, binding.tier, binding.status,
                       binding.languages, binding.reference_id,
                       identity.id, identity.name,
                       identity.image, identity.gender, identity.age,
                       identity.accent, identity.trait, identity.scene,
                       identity.notes
                  FROM voice_bindings binding
                  JOIN voice_identities identity
                    ON identity.id = binding.identity_id
                 WHERE binding.source = 'custom'
                   AND identity.status = 'active'
                   AND binding.archived_at IS NULL
                 ORDER BY identity.name, binding.model_id
            """)
            rows = cursor.fetchall()
        return [{
            "binding_id": str(binding_id),
            "voice_id": provider_id, "target_model": model_id,
            "source": "custom", "engine": engine, "tier": tier,
            "status": status, "languages": languages or [],
            "reference_id": reference_id,
            "identity_id": identity_id, "name": name,
            "image": image or "", "gender": gender or "", "age": age,
            "accent": accent or "", "trait": trait or "",
            "scene": scene or "", "notes": notes or "",
        } for binding_id, provider_id, model_id, engine, tier, status, languages, reference_id,
            identity_id, name, image, gender, age, accent, trait, scene, notes
            in rows]

    def binding_references(self) -> dict:
        with read_only() as cursor:
            cursor.execute("""
                SELECT binding.provider_voice_id, binding.identity_id,
                       reference.id, reference.original_name,
                       reference.original_path, reference.normalized_path,
                       reference.source_language
                  FROM voice_bindings binding
                  LEFT JOIN voice_references reference
                    ON reference.id = binding.reference_id
                 ORDER BY reference.created_at DESC NULLS LAST
            """)
            rows = cursor.fetchall()
        result: dict[str, dict] = {}
        for (provider_id, identity_id, reference_id, name, original,
             normalized, source_language) in rows:
            if reference_id and provider_id not in result:
                result[provider_id] = {
                    "identity_id": identity_id,
                    "id": reference_id, "original_name": name or "",
                    "original_path": original or "",
                    "normalized_path": normalized or "",
                    "source_language": source_language or "",
                }
        return result

    def catalog_metadata(self) -> dict:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, image, favourite, note, name, gender, age, trait,
                       scene, languages, provider_voice_id, engine,
                       target_model, provider_status
                  FROM voices
            """)
            rows = cursor.fetchall()
        return {voice_key(row[0]): {
            "image": row[1] or "", "favourite": row[2],
            "note": row[3] or "", "name": row[4] or "",
            "gender": row[5] or "", "age": row[6],
            "trait": row[7] or "", "scene": row[8] or "",
            "languages": row[9] or "",
            "provider_voice_id": row[10] or "", "engine": row[11] or "",
            "target_model": row[12] or "",
            "provider_status": row[13] or "",
        } for row in rows}

    def catalog_usage(self) -> dict:
        with read_only() as cursor:
            cursor.execute("""
                SELECT take.provider_voice_id, count(*) AS uses,
                       count(DISTINCT part.production_id) AS folders,
                       coalesce(sum(take.cost), 0) AS spend,
                       max(take.created_at) AS last_used,
                       (array_agg(take.filename ORDER BY take.created_at DESC)
                           FILTER (WHERE take.filename <> ''))[1] AS latest
                  FROM takes take
                  LEFT JOIN production_parts part ON part.id=take.part_id
                 WHERE take.provider_voice_id NOT IN ('-', '')
                 GROUP BY take.provider_voice_id
            """)
            rows = cursor.fetchall()
        rolled: dict[str, dict] = {}
        for voice, uses, folders, spend, last_used, latest in rows:
            key = voice_key(voice)
            seen = rolled.setdefault(key, {
                "uses": 0, "folders": 0, "spend": 0.0,
                "last_used": None, "mine": None,
            })
            seen["uses"] += uses
            seen["folders"] += folders
            seen["spend"] += float(spend)
            stamp = last_used.isoformat()
            if not seen["last_used"] or stamp > seen["last_used"]:
                seen["last_used"] = stamp
                seen["mine"] = latest
        return rolled
