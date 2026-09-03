"""Canonical PostgreSQL persistence for voice profiles and catalogues."""

from __future__ import annotations

import re
from uuid import uuid4

from origins.infrastructure.postgres.session import read_only, transaction
from origins.infrastructure.postgres.provider_catalogue import (
    ProviderCatalogueRepository,
)
from origins.domain.delivery_tags import TAG_RE, KNOWN_TAGS


_VOICE_PREFIX = re.compile(r"^qwen[\w.-]*?-tts-(?:plus|flash)-", re.I)
_PROFILE_FIELDS = {
    "name", "image", "gender", "age", "accent", "trait", "scene", "notes",
    "editorial_language", "favourite", "status",
}


def voice_key(voice_id: str) -> str:
    """Collapse Plus/Flash provider IDs to their shared catalogue identity."""
    return _VOICE_PREFIX.sub("", voice_id or "").strip()


class VoiceRepository:
    """One persistence owner for voice profiles, bindings and metadata."""

    def catalogue_bindings(self) -> list[dict]:
        return ProviderCatalogueRepository().bindings()

    def profiles(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT identity.id, identity.name, identity.metadata,
                       identity.image, identity.gender, identity.age,
                       identity.accent, identity.trait, identity.scene,
                       identity.notes, identity.recording_language,
                       identity.editorial_language,
                       identity.preferred_reference_id,
                       identity.favourite, identity.status,
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
                    "recording_language": row[10] or "",
                    "editorial_language": row[11] or "",
                    "favourite": bool(row[13]),
                    "status": row[14] or "active",
                },
                "preferred_reference_id": row[12],
                "created_at": row[15].isoformat(),
                "updated_at": row[16].isoformat(),
                "references": [], "bindings": [], "jobs": [], "previews": [],
                "used_tags": [],
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
                        "windows": [],
                        "created_at": created_at.isoformat(),
                        "updated_at": updated_at.isoformat(),
                    })

            references = {
                reference["id"]: reference
                for identity in identities
                for reference in identity["references"]
            }
            cursor.execute("""
                SELECT source_window.id,source_window.reference_id,
                       source_window.provider_model_id,
                       source_window.start_ms,source_window.duration_ms,
                       coalesce(source_window.source_language,''),
                       coalesce(source_window.transcript,''),
                       source_window.enable_preprocess,
                       coalesce(source_window.derived_path,''),
                       source_window.created_at,source_window.updated_at
                  FROM voice_reference_windows source_window
                  JOIN voice_references reference
                    ON reference.id=source_window.reference_id
                 WHERE reference.identity_id IS NOT NULL
                 ORDER BY source_window.provider_model_id NULLS FIRST,
                          source_window.created_at
            """)
            for row in cursor.fetchall():
                reference = references.get(row[1])
                if reference is not None:
                    reference["windows"].append({
                        "id": row[0], "reference_id": row[1],
                        "provider_model_id": row[2], "start_ms": row[3],
                        "duration_ms": row[4], "source_language": row[5],
                        "transcript": row[6], "enable_preprocess": row[7],
                        "derived_path": row[8],
                        "created_at": row[9].isoformat(),
                        "updated_at": row[10].isoformat(),
                    })

            cursor.execute("""
                SELECT id,provider_voice_id,model_id,identity_id,engine,tier,
                       status,languages,reference_id,provider,provider_region,
                       provider_model_id,created_at,reference_window_id,
                       validation_state,superseded_by
                  FROM voice_bindings ORDER BY created_at
            """)
            for row in cursor.fetchall():
                (binding_id,provider_id,model_id,identity_id,engine,tier,status,
                 languages,reference_id,provider,region,provider_model_id,
                 created_at,reference_window_id,validation_state,
                 superseded_by) = row
                if identity_id in by_id:
                    by_id[identity_id]["bindings"].append({
                        "binding_id": str(binding_id),
                        "provider_voice_id": provider_id, "model_id": model_id,
                        "provider": provider, "region": region,
                        "provider_model_id": provider_model_id,
                        "engine": engine, "tier": tier, "status": status,
                        "languages": languages or [],
                        "reference_id": reference_id,
                        "reference_window_id": reference_window_id,
                        "validation_state": validation_state,
                        "superseded_by": (str(superseded_by)
                                           if superseded_by else None),
                        "created_at": created_at.isoformat(),
                    })

            cursor.execute("""
                SELECT id, identity_id, reference_id, model_id, engine, tier,
                       status, provider_voice_id, error, attempts, updated_at,
                       provider,provider_region,provider_model_id,adapter_key,
                       classification,binding_id,reference_window_id
                  FROM voice_package_jobs ORDER BY created_at
            """)
            job_keys = (
                "id", "identity_id", "reference_id", "model_id", "engine",
                "tier", "status", "provider_voice_id", "error", "attempts",
                "updated_at", "provider", "region", "provider_model_id",
                "adapter_key", "classification", "binding_id",
                "reference_window_id",
            )
            for row in cursor.fetchall():
                if row[1] in by_id:
                    values = list(row)
                    values[10] = values[10].isoformat()
                    if values[16] is not None:
                        values[16] = str(values[16])
                    by_id[row[1]]["jobs"].append(dict(zip(job_keys, values)))

            cursor.execute("""
                SELECT preview.id,preview.identity_id,preview.binding_id,
                       preview.job_id,preview.tag,preview.text,
                       coalesce(preview.instruction,''),preview.seed,
                       CASE WHEN job.status='ok' THEN 'ready'
                            WHEN job.status IN ('failed','blocked') THEN 'failed'
                            WHEN job.status='running' THEN 'running'
                            ELSE preview.status END,
                       preview.approval_state,
                       coalesce(job.result->>'name',preview.filename,''),
                       coalesce((job.result->>'duration_ms')::integer,
                                preview.duration_ms),
                       coalesce(job.error,preview.error,''),preview.created_at,
                       binding.model_id
                  FROM voice_previews preview
                  JOIN voice_bindings binding ON binding.id=preview.binding_id
             LEFT JOIN jobs job ON job.id=preview.job_id
                 ORDER BY preview.created_at DESC
            """)
            keys = ("id", "identity_id", "binding_id", "job_id", "tag",
                    "text", "instruction", "seed", "status",
                    "approval_state", "filename", "duration_ms", "error",
                    "created_at", "model_id")
            for row in cursor.fetchall():
                if row[1] in by_id:
                    values = list(row)
                    values[0] = str(values[0])
                    values[2] = str(values[2])
                    values[13] = values[13].isoformat()
                    by_id[row[1]]["previews"].append(dict(zip(keys, values)))

            cursor.execute("""
                SELECT coalesce(clip.voice_identity_id,binding.identity_id),
                       clip.tagged_text
                  FROM clips clip
             LEFT JOIN voice_bindings binding ON binding.id=clip.binding_id
                 WHERE coalesce(clip.tagged_text,'') <> ''
            """)
            tags_by_identity: dict[str, set[str]] = {}
            for identity_id, tagged_text in cursor.fetchall():
                if identity_id not in by_id:
                    continue
                tags = tags_by_identity.setdefault(identity_id, set())
                tags.update(
                    match.group(1).strip().casefold()
                    for match in TAG_RE.finditer(tagged_text or "")
                    if match.group(1).strip().casefold() in KNOWN_TAGS
                )
            for identity_id, tags in tags_by_identity.items():
                by_id[identity_id]["used_tags"] = sorted(tags)
        return identities

    def create_preview(self, identity_id: str, binding_id: str, *, job_id: int,
                       tag: str | None, text: str, instruction: str,
                       seed: int) -> str:
        preview_id = uuid4()
        with transaction() as cursor:
            cursor.execute("""
                INSERT INTO voice_previews
                    (id,identity_id,binding_id,job_id,tag,text,instruction,seed)
                SELECT %s,%s,binding.id,%s,%s,%s,%s,%s
                  FROM voice_bindings binding
                 WHERE binding.id=%s AND binding.identity_id=%s
                RETURNING id
            """, (preview_id, identity_id, job_id, tag or None, text,
                  instruction or None, seed, binding_id, identity_id))
            row = cursor.fetchone()
        if not row:
            raise LookupError("That recording method does not belong to this Voice.")
        return str(row[0])

    def set_preview_approval(self, identity_id: str, preview_id: str,
                             approval_state: str) -> bool:
        if approval_state not in {"unreviewed", "approved", "rejected"}:
            raise ValueError("Choose approved, rejected, or unreviewed.")
        with transaction() as cursor:
            cursor.execute("""
                SELECT preview.binding_id, binding.provider,
                       binding.provider_region,
                       binding.model_id,
                       binding.validation_state, job.status
                  FROM voice_previews preview
                  JOIN voice_bindings binding ON binding.id=preview.binding_id
             LEFT JOIN jobs job ON job.id=preview.job_id
                 WHERE preview.id=%s AND preview.identity_id=%s
                 FOR UPDATE OF preview,binding
            """, (preview_id, identity_id))
            selected = cursor.fetchone()
            if not selected:
                return False
            binding_id, provider, region, method_key, binding_state, job_status = selected
            if approval_state == "approved":
                if job_status != "ok":
                    raise ValueError(
                        "Listen to a completed Voice test before approving this method.")
                cursor.execute("""
                    UPDATE voice_bindings
                       SET validation_state='superseded',superseded_by=%s
                     WHERE identity_id=%s AND provider=%s
                       AND provider_region=%s
                       AND model_id=%s
                       AND validation_state='approved' AND archived_at IS NULL
                       AND id<>%s
                """, (binding_id, identity_id, provider, region, method_key,
                      binding_id))
                cursor.execute("""
                    UPDATE voice_bindings
                       SET validation_state='approved',superseded_by=NULL
                     WHERE id=%s
                """, (binding_id,))
            elif approval_state == "rejected" and binding_state == "candidate":
                cursor.execute("""
                    UPDATE voice_bindings SET validation_state='rejected'
                     WHERE id=%s
                """, (binding_id,))
            cursor.execute("""
                UPDATE voice_previews SET approval_state=%s,updated_at=now()
                 WHERE id=%s AND identity_id=%s
            """, (approval_state, preview_id, identity_id))
            return cursor.rowcount == 1

    def profile_usage(self) -> dict[str, dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT coalesce(clip.voice_identity_id,
                                binding.identity_id) AS identity_id,
                       count(*) AS uses,
                       count(DISTINCT part.production_id) AS productions,
                       coalesce(sum(clip.cost), 0),
                       max(clip.created_at),
                       (array_agg(clip.filename
                                  ORDER BY clip.created_at DESC)
                           FILTER (WHERE clip.filename <> ''))[1]
                  FROM clips clip
                  LEFT JOIN production_parts part ON part.id=clip.part_id
                  LEFT JOIN voice_bindings binding
                    ON binding.id = clip.binding_id
                 WHERE clip.provider_voice_id NOT IN ('', '-')
                 GROUP BY coalesce(clip.voice_identity_id,
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
                "editorial_language", "status"):
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
                SELECT clip.provider_voice_id, '', coalesce(max(clip.model_id), ''),
                       count(*), count(DISTINCT part.production_id),
                       max(clip.created_at),
                       (array_agg(clip.filename ORDER BY clip.created_at DESC)
                           FILTER (WHERE coalesce(clip.filename, '') <> ''))[1]
                  FROM clips clip
                  LEFT JOIN production_parts part ON part.id=clip.part_id
                 WHERE clip.voice_identity_id IS NULL
                   AND clip.binding_resolution_status = 'unresolved'
                   AND clip.provider_voice_id ~* '^qwen.*-[0-9a-f]{32}$'
                 GROUP BY clip.provider_voice_id
                 ORDER BY max(clip.created_at) DESC
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
                UPDATE clips SET voice_identity_id = %s,
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

    def custom_bindings(self, *, include_candidates: bool = False) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT binding.id, binding.provider_voice_id, binding.model_id,
                       binding.engine, binding.tier, binding.status,
                       binding.languages, binding.reference_id,
                       binding.provider, binding.provider_region,
                       binding.validation_state,
                       provider_model.adapter_key, provider_model.pricing,
                       coalesce(jsonb_agg(jsonb_build_object(
                           'id', capability.id, 'name', capability.name,
                           'description', capability.description,
                           'controls', capability.controls,
                           'ui_metadata', capability.ui_metadata
                       ) ORDER BY capability.id)
                       FILTER (WHERE capability.id IS NOT NULL), '[]'::jsonb),
                       identity.id, identity.name,
                       identity.image, identity.gender, identity.age,
                       identity.accent, identity.trait, identity.scene,
                       identity.notes
                  FROM voice_bindings binding
                  JOIN voice_identities identity
                    ON identity.id = binding.identity_id
             LEFT JOIN provider_models provider_model
                    ON provider_model.id = binding.provider_model_id
             LEFT JOIN provider_model_capabilities model_capability
                    ON model_capability.provider_model_id = provider_model.id
             LEFT JOIN capabilities capability
                    ON capability.id = model_capability.capability_id
                 WHERE binding.source = 'custom'
                   AND identity.status = 'active'
                   AND binding.archived_at IS NULL
                   AND (binding.validation_state = 'approved'
                        OR (%s AND binding.validation_state = 'candidate'))
              GROUP BY binding.id, binding.provider_voice_id, binding.model_id,
                       binding.engine, binding.tier, binding.status,
                       binding.languages, binding.reference_id,
                       binding.provider, binding.provider_region,
                       binding.validation_state,
                       provider_model.adapter_key, provider_model.pricing,
                       identity.id, identity.name, identity.image,
                       identity.gender, identity.age, identity.accent,
                       identity.trait, identity.scene, identity.notes
                 ORDER BY identity.name, binding.model_id
            """, (include_candidates,))
            rows = cursor.fetchall()
        return [{
            "binding_id": str(binding_id),
            "provider_voice_id": provider_id, "voice_id": provider_id,
            "model_id": model_id, "target_model": model_id,
            "source": "custom", "engine": engine, "tier": tier,
            "status": status, "languages": languages or [],
            "reference_id": reference_id,
            "provider": provider or "alibaba",
            "region": provider_region or "intl",
            "validation_state": validation_state,
            "adapter_key": adapter_key or engine,
            "estimate_rate_per_million_chars": float(
                (pricing or {}).get("speech_per_million_chars") or 0),
            "capabilities": capabilities or [],
            "identity_id": identity_id, "name": name,
            "image": image or "", "gender": gender or "", "age": age,
            "accent": accent or "", "trait": trait or "",
            "scene": scene or "", "notes": notes or "",
        } for binding_id, provider_id, model_id, engine, tier, status, languages, reference_id,
            provider, provider_region, validation_state, adapter_key, pricing, capabilities,
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
                SELECT clip.provider_voice_id, count(*) AS uses,
                       count(DISTINCT part.production_id) AS productions,
                       coalesce(sum(clip.cost), 0) AS spend,
                       max(clip.created_at) AS last_used,
                       (array_agg(clip.filename ORDER BY clip.created_at DESC)
                           FILTER (WHERE clip.filename <> ''))[1] AS latest
                  FROM clips clip
                  LEFT JOIN production_parts part ON part.id=clip.part_id
                 WHERE clip.provider_voice_id NOT IN ('-', '')
                 GROUP BY clip.provider_voice_id
            """)
            rows = cursor.fetchall()
        rolled: dict[str, dict] = {}
        for voice, uses, productions, spend, last_used, latest in rows:
            key = voice_key(voice)
            seen = rolled.setdefault(key, {
                "uses": 0, "productions": 0, "spend": 0.0,
                "last_used": None, "latest_preview": None,
            })
            seen["uses"] += uses
            seen["productions"] += productions
            seen["spend"] += float(spend)
            stamp = last_used.isoformat()
            if not seen["last_used"] or stamp > seen["last_used"]:
                seen["last_used"] = stamp
                seen["latest_preview"] = latest
        return rolled
