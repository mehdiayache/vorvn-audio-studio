"""PostgreSQL owner for cloned-voice package state and attempt ledgers."""

from __future__ import annotations

import json
from uuid import uuid4

from audio_studio.domain import provider_catalog
from audio_studio.domain.voice_packages import (
    CreatedVoiceBinding,
    VoicePackageJob,
)
from audio_studio.infrastructure.postgres.session import read_only, transaction
from audio_studio.infrastructure.postgres.spend import today_provider_spend


_ACTIVE = ("queued", "creating")
_RETRYABLE = ("failed", "interrupted")


def _job(row) -> VoicePackageJob | None:
    if not row:
        return None
    return VoicePackageJob(
        id=row[0], identity_id=row[1], reference_id=row[2],
        model_id=row[3], provider=row[4], region=row[5],
        provider_model_id=row[6], adapter_key=row[7], engine=row[8],
        tier=row[9], output_languages=list(row[10] or []),
        attempts=int(row[11]), name=row[12], metadata=row[13] or {},
    )


class VoicePackageRepository:
    def references(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, original_path, normalized_path
                  FROM voice_references ORDER BY created_at, id
            """)
            rows = cursor.fetchall()
        return [{"id": row[0], "original_path": row[1] or "",
                 "normalized_path": row[2] or ""} for row in rows]

    def update_reference_paths(self, reference_id: str, *, original_path: str,
                               normalized_path: str) -> bool:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE voice_references
                   SET original_path = %s, normalized_path = %s
                 WHERE id = %s
            """, (original_path or None, normalized_path or None, reference_id))
            return cursor.rowcount == 1

    def mark_reference_unavailable(self, reference_id: str, detail: str) -> None:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE voice_references
                   SET diagnostics = diagnostics || %s::jsonb,
                       updated_at = now()
                 WHERE id = %s
            """, (json.dumps({
                "availability": "unresolved",
                "storage_error": str(detail or "Reference master unavailable")[:500],
            }), reference_id))

    def today_spend(self) -> float:
        return today_provider_spend()

    def reference(self, reference_id: str) -> dict | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, identity_id, original_name, original_path,
                       normalized_path, source_url, source_language,
                       transcript, sha256, duration_ms, sample_rate, channels,
                       metadata, created_at, updated_at, storage_backend,
                       storage_bucket, storage_key, original_storage_key,
                       normalized_storage_key, original_sha256,
                       normalized_sha256, original_size_bytes,
                       normalized_size_bytes
                  FROM voice_references WHERE id = %s
            """, (reference_id,))
            row = cursor.fetchone()
        if not row:
            return None
        return {
            "id": row[0], "identity_id": row[1],
            "original_name": row[2] or "", "original_path": row[3] or "",
            "normalized_path": row[4] or "", "source_url": row[5] or "",
            "source_language": row[6] or "", "transcript": row[7] or "",
            "sha256": row[8] or "", "duration_ms": row[9],
            "sample_rate": row[10], "channels": row[11],
            "metadata": row[12] or {}, "created_at": row[13].isoformat(),
            "updated_at": row[14].isoformat(),
            "storage_backend": row[15] or "filesystem",
            "storage_bucket": row[16] or "",
            "storage_key": row[17] or "",
            "original_storage_key": row[18] or "",
            "normalized_storage_key": row[19] or row[17] or "",
            "original_sha256": row[20] or "",
            "normalized_sha256": row[21] or row[8] or "",
            "original_size_bytes": row[22],
            "normalized_size_bytes": row[23],
        }

    def create_reference(self, *, original_name: str, original_path: str,
                         normalized_path: str, source_url: str = "",
                         reference_id: str | None = None, sha256: str = "",
                         duration_ms: int | None = None,
                         sample_rate: int | None = None,
                         channels: int | None = None,
                         source_language: str = "", transcript: str = "",
                         metadata: dict | None = None,
                         storage_backend: str = "filesystem",
                         storage_bucket: str | None = None,
                         storage_key: str | None = None,
                         original_storage_key: str | None = None,
                         normalized_storage_key: str | None = None,
                         original_sha256: str = "",
                         normalized_sha256: str = "",
                         original_size_bytes: int | None = None,
                         normalized_size_bytes: int | None = None) -> str:
        reference_id = reference_id or f"ref_{uuid4().hex}"
        with transaction() as cursor:
            cursor.execute("""
                INSERT INTO voice_references
                    (id, original_name, original_path, normalized_path,
                     source_url, sha256, duration_ms, sample_rate, channels,
                     source_language, transcript, metadata, storage_backend,
                     storage_bucket, storage_key, original_storage_key,
                     normalized_storage_key, original_sha256,
                     normalized_sha256, original_size_bytes,
                     normalized_size_bytes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (reference_id, original_name or None, original_path or None,
                  normalized_path or None, source_url or None,
                  sha256 or None, duration_ms, sample_rate, channels,
                  source_language or None, transcript or None,
                  json.dumps(metadata or {}), storage_backend,
                  storage_bucket, storage_key or normalized_path,
                  original_storage_key or original_path,
                  normalized_storage_key or storage_key or normalized_path,
                  original_sha256 or None,
                  normalized_sha256 or sha256 or None,
                  original_size_bytes, normalized_size_bytes))
        return reference_id

    def create_package(self, *, name: str, metadata: dict, reference_id: str,
                       identity_id: str | None, routes: list[dict],
                       estimate: float) -> tuple[str, list[str]]:
        queued: list[str] = []
        source_language = str((routes[0] if routes else {}).get("language") or "")
        with transaction() as cursor:
            cursor.execute("""
                SELECT identity_id FROM voice_references
                 WHERE id = %s FOR UPDATE
            """, (reference_id,))
            reference = cursor.fetchone()
            if not reference:
                raise ValueError("The reference recording no longer exists.")
            attached_identity = reference[0]
            if identity_id:
                cursor.execute("""
                    SELECT status FROM voice_identities WHERE id = %s FOR UPDATE
                """, (identity_id,))
                identity = cursor.fetchone()
                if not identity:
                    raise LookupError("That voice identity no longer exists.")
                if identity[0] == "archived":
                    raise ValueError("Restore that voice before adding capabilities.")
                if attached_identity not in (None, identity_id):
                    raise RuntimeError("That source belongs to another voice.")
            else:
                identity_id = attached_identity
                if not identity_id:
                    identity_id = f"voice_{uuid4().hex}"
                    cursor.execute("""
                        INSERT INTO voice_identities
                            (id, name, metadata, gender, age, accent, trait,
                             scene, notes, editorial_language)
                        VALUES (%s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s,
                                %s)
                    """, (
                        identity_id, name, json.dumps(metadata or {}),
                        metadata.get("gender") or None,
                        metadata.get("age") or None,
                        metadata.get("accent") or None,
                        metadata.get("trait") or None,
                        metadata.get("scene") or None,
                        metadata.get("notes") or None,
                        metadata.get("editorial_language") or None,
                    ))
            cursor.execute("""
                UPDATE voice_references
                   SET identity_id = %s, source_language = %s,
                       updated_at = now()
                 WHERE id = %s
            """, (identity_id, source_language or None, reference_id))
            cursor.execute("""
                UPDATE voice_identities
                   SET preferred_reference_id=coalesce(
                           preferred_reference_id,%s),
                       updated_at=now()
                 WHERE id=%s
            """, (reference_id, identity_id))
            for route in routes:
                provider_model_id = str(
                    route.get("provider_model_id") or "").strip()
                if not provider_model_id:
                    raise ValueError(
                        "Every installed enrollment method needs an exact provider model ID.")
                cursor.execute("""
                    SELECT 1 FROM voice_package_jobs
                     WHERE identity_id=%s AND provider_model_id=%s
                       AND reference_id=%s
                """, (identity_id, provider_model_id, reference_id))
                if cursor.fetchone():
                    continue
                cursor.execute("""
                    SELECT 1 FROM voice_bindings
                     WHERE identity_id = %s AND provider_model_id = %s
                       AND reference_id = %s
                       AND status NOT IN
                           ('deleted', 'undeployed', 'archived', 'failed')
                """, (identity_id, provider_model_id, reference_id))
                if cursor.fetchone():
                    continue
                proposed = f"vjob_{uuid4().hex}"
                cursor.execute("""
                    INSERT INTO voice_package_jobs
                        (id, identity_id, reference_id, model_id, engine, tier,
                         provider, provider_region, provider_model_id,
                         adapter_key, classification, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, 'queued')
                    RETURNING id, status
                """, (proposed, identity_id, reference_id, route["model_id"],
                      route["engine"], route["tier"],
                      route.get("provider") or "alibaba",
                      route.get("region") or "intl",
                      provider_model_id,
                      route.get("adapter_key") or route["engine"],
                      route.get("classification") or (
                          "documented" if route.get("source_language_documented")
                          else "experimental")))
                job_id, status = cursor.fetchone()
                if status == "queued":
                    queued.append(job_id)
            status = "queued" if queued else "ok"
            cursor.execute("""
                INSERT INTO jobs
                    (kind, status, estimated, cost, voice, voice_identity_id,
                     detail, done, total, payload, requested_route, source_tool,
                     operation_label, finished_at)
                VALUES ('clone_package', %s, %s, 0, %s, %s, %s, 0, %s,
                        %s::jsonb, %s::jsonb, 'voices',
                        'Create voice capabilities',
                        CASE WHEN %s = 'ok' THEN now() ELSE NULL END)
            """, (
                status, estimate, identity_id, identity_id,
                f"{name} · {len(queued)} capabilities queued", len(queued),
                json.dumps({"identity_id": identity_id,
                            "reference_id": reference_id,
                            "models": [route["model_id"] for route in routes]}),
                json.dumps({"executor": "voice-package-worker-v1"}), status,
            ))
        return identity_id, queued

    def record_blocked(self, *, estimate: float, detail: str) -> None:
        with transaction() as cursor:
            cursor.execute("""
                INSERT INTO jobs
                    (kind, status, estimated, cost, detail, source_tool,
                     operation_label, finished_at)
                VALUES ('clone_package', 'blocked', %s, 0, %s, 'voices',
                        'Create voice capabilities', now())
            """, (estimate, detail[:300]))

    def retry(self, enrollment_job_id: str) -> str | None:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE voice_package_jobs
                   SET status = 'queued', error = NULL, updated_at = now()
                 WHERE id = %s
                   AND status = ANY(%s) RETURNING id
            """, (enrollment_job_id, list(_RETRYABLE)))
            row = cursor.fetchone()
            return row[0] if row else None

    def claim_next(self, job_id: str | None = None) -> VoicePackageJob | None:
        """Lease only explicitly queued work; interrupted calls need a human retry."""
        with transaction() as cursor:
            cursor.execute("""
                WITH candidate AS (
                    SELECT id FROM voice_package_jobs
                     WHERE status = 'queued'
                       AND (%s::text IS NULL OR id = %s)
                     ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
                ), claimed AS (
                    UPDATE voice_package_jobs job
                       SET status = 'creating', attempts = attempts + 1,
                           error = NULL, updated_at = now()
                      FROM candidate WHERE job.id = candidate.id
                    RETURNING job.id, job.identity_id, job.reference_id,
                              job.model_id, job.provider, job.provider_region,
                              job.provider_model_id, job.adapter_key,
                              job.engine, job.tier, job.attempts
                )
                SELECT claimed.id, claimed.identity_id, claimed.reference_id,
                       claimed.model_id, claimed.provider,
                       claimed.provider_region, claimed.provider_model_id,
                       claimed.adapter_key, claimed.engine, claimed.tier,
                       coalesce(model.output_languages, '[]'::jsonb),
                       claimed.attempts, identity.name,
                       identity.metadata || jsonb_strip_nulls(
                           jsonb_build_object(
                               'language', reference.source_language,
                               'transcript', reference.transcript))
                  FROM claimed JOIN voice_identities identity
                    ON identity.id = claimed.identity_id
                  JOIN voice_references reference
                    ON reference.id = claimed.reference_id
                  LEFT JOIN provider_models model
                    ON model.id=claimed.provider_model_id
            """, (job_id, job_id))
            return _job(cursor.fetchone())

    def start_attempt(self, job: VoicePackageJob, estimate: float) -> int:
        with transaction() as cursor:
            cursor.execute("""
                INSERT INTO jobs
                    (kind, status, model, estimated, cost, voice,
                     voice_identity_id, engine, tier, detail, payload,
                     idempotency_key, requested_route, source_tool,
                     operation_label, started_at, last_heartbeat_at)
                VALUES ('clone', 'running', %s, %s, 0, %s, %s, %s, %s, %s,
                        %s::jsonb, %s, %s::jsonb, 'voices',
                        'Create voice capability', now(), now())
                RETURNING id
            """, (
                job.model_id, estimate, job.identity_id, job.identity_id,
                job.engine, job.tier,
                f"{job.name} · {job.engine} {job.tier}",
                json.dumps({"voice_package_job_id": job.id,
                            "reference_id": job.reference_id}),
                f"voice-package:{job.id}:attempt:{job.attempts}",
                json.dumps({"executor": "voice-package-worker-v1",
                            "provider": job.provider,
                            "region": job.region,
                            "provider_model_id": job.provider_model_id,
                            "adapter_key": job.adapter_key,
                            "engine": job.engine, "model": job.model_id}),
            ))
            return int(cursor.fetchone()[0])

    def recoverable_binding(self, job: VoicePackageJob) -> CreatedVoiceBinding | None:
        """Return a definite provider result from a prior local-save failure."""
        with read_only() as cursor:
            cursor.execute("""
                SELECT attempt.diagnostics->'provider_result'
                  FROM provider_attempts attempt
                  JOIN jobs ledger ON ledger.id=attempt.job_id
                 WHERE ledger.payload->>'voice_package_job_id'=%s
                   AND attempt.status='succeeded'
                   AND attempt.diagnostics ? 'provider_result'
                 ORDER BY attempt.finished_at DESC, attempt.id DESC LIMIT 1
            """, (job.id,))
            row = cursor.fetchone()
        receipt = row[0] if row else None
        if not receipt or not receipt.get("provider_voice_id"):
            return None
        return CreatedVoiceBinding(
            provider_voice_id=str(receipt["provider_voice_id"]),
            provider_region=str(receipt.get("provider_region") or job.region),
            provider_endpoint=str(receipt.get("provider_endpoint") or ""),
            price_version=str(receipt.get("price_version") or "unknown"),
            estimated_cost=float(receipt.get("estimated_cost") or 0),
            cost=float(receipt.get("cost") or 0),
            cost_basis=str(receipt.get("cost_basis") or "historical_unknown"),
        )

    def complete(self, job: VoicePackageJob, activity_id: int,
                 binding: CreatedVoiceBinding, *, recovered: bool = False
                 ) -> None:
        output_languages = job.output_languages or provider_catalog.CAPABILITIES.get(
            job.engine, {}).get("output_languages", [])
        with transaction() as cursor:
            cursor.execute("""
                SELECT status FROM voice_package_jobs
                 WHERE id = %s FOR UPDATE
            """, (job.id,))
            current = cursor.fetchone()
            if not current or current[0] != "creating":
                raise RuntimeError("That voice capability is no longer active.")
            provider_model_id = job.provider_model_id
            if provider_model_id:
                cursor.execute("SELECT id FROM provider_models WHERE id=%s",
                               (provider_model_id,))
            if not provider_model_id or not cursor.fetchone():
                # Honest compatibility for historical/test enrollments whose
                # exact model predates the installed provider catalogue.
                provider_model_id = None
            cursor.execute("""
                INSERT INTO voice_bindings
                    (provider_voice_id, model_id, identity_id, engine, tier,
                     status, languages, reference_id, provider,
                     provider_region, provider_model_id)
                VALUES (%s, %s, %s, %s, %s, 'active', %s::jsonb, %s,
                        %s, %s, %s)
                ON CONFLICT (provider_voice_id, model_id) DO NOTHING
                RETURNING id
            """, (
                binding.provider_voice_id, job.model_id, job.identity_id,
                job.engine, job.tier,
                json.dumps(output_languages),
                job.reference_id, job.provider, job.region,
                provider_model_id,
            ))
            created = cursor.fetchone()
            if created:
                binding_id = created[0]
            else:
                cursor.execute("""
                    SELECT id, identity_id, reference_id FROM voice_bindings
                     WHERE provider_voice_id=%s AND model_id=%s
                """, (binding.provider_voice_id, job.model_id))
                existing = cursor.fetchone()
                if not existing or existing[1:] != (
                        job.identity_id, job.reference_id):
                    raise RuntimeError(
                        "Provider voice ID collision; no binding was replaced.")
                binding_id = existing[0]
            cursor.execute("""
                UPDATE voice_references SET identity_id = %s WHERE id = %s
            """, (job.identity_id, job.reference_id))
            cursor.execute("""
                UPDATE voice_package_jobs
                   SET status = 'ready', provider_voice_id = %s, error = NULL,
                       binding_id=%s, updated_at = now() WHERE id = %s
            """, (binding.provider_voice_id, binding_id, job.id))
            cursor.execute("""
                UPDATE jobs
                   SET status = 'ok', cost = %s, estimated = %s,
                       voice = %s, provider_voice_id = %s,
                       cost_basis = %s, price_version = %s,
                       provider_region = %s, provider_endpoint = %s,
                       resolved_route = %s::jsonb, output_ids = %s::jsonb,
                       result = %s::jsonb, finished_at = now(),
                       last_heartbeat_at = now(),
                       elapsed_ms = greatest(0, extract(epoch FROM
                           (now() - coalesce(started_at, created_at))) * 1000)::int
                 WHERE id = %s
            """, (
                0 if recovered else binding.cost,
                0 if recovered else binding.estimated_cost,
                binding.provider_voice_id, binding.provider_voice_id,
                "local_recovery" if recovered else binding.cost_basis,
                binding.price_version,
                job.region, binding.provider_endpoint,
                json.dumps({"engine": job.engine, "model": job.model_id,
                            "provider": job.provider,
                            "region": job.region,
                            "provider_model_id": job.provider_model_id,
                            "adapter_key": job.adapter_key}),
                json.dumps([{"type": "voice_binding",
                             "id": binding.provider_voice_id,
                             "model_id": job.model_id}]),
                json.dumps({"provider_voice_id": binding.provider_voice_id,
                            "identity_id": job.identity_id,
                            "model_id": job.model_id}), activity_id,
            ))
            self._reconcile(cursor, job.identity_id)
            self._reconcile_campaigns(cursor, job.id)

    def fail(self, job: VoicePackageJob, activity_id: int,
             error: str) -> None:
        message = error[:600]
        with transaction() as cursor:
            cursor.execute("""
                UPDATE voice_package_jobs
                   SET status = 'failed', error = %s, updated_at = now()
                 WHERE id = %s AND status = 'creating'
            """, (message, job.id))
            cursor.execute("""
                UPDATE jobs SET status = 'failed', error = %s,
                       cost=coalesce((SELECT sum(coalesce(attempt.cost,0))
                         FROM provider_attempts attempt
                        WHERE attempt.job_id=jobs.id),cost),
                       cost_basis=coalesce((SELECT
                         attempt.diagnostics->'provider_result'->>'cost_basis'
                         FROM provider_attempts attempt
                        WHERE attempt.job_id=jobs.id
                          AND attempt.status='succeeded'
                        ORDER BY attempt.id DESC LIMIT 1),cost_basis),
                       finished_at = now(), last_heartbeat_at = now(),
                       elapsed_ms = greatest(0, extract(epoch FROM
                           (now() - coalesce(started_at, created_at))) * 1000)::int
                 WHERE id = %s
            """, (message[:400], activity_id))
            self._reconcile(cursor, job.identity_id)
            self._reconcile_campaigns(cursor, job.id)

    @staticmethod
    def _reconcile_campaigns(cursor, package_job_id: str) -> None:
        cursor.execute("""
            UPDATE enrollment_campaign_items item
               SET status=package.status
              FROM voice_package_jobs package
             WHERE item.package_job_id=package.id AND package.id=%s
            RETURNING item.campaign_id
        """, (package_job_id,))
        campaign_ids = {row[0] for row in cursor.fetchall()}
        for campaign_id in campaign_ids:
            cursor.execute("""
                SELECT array_agg(coalesce(package.status,item.status))
                  FROM enrollment_campaign_items item
                  LEFT JOIN voice_package_jobs package
                    ON package.id=item.package_job_id
                 WHERE item.campaign_id=%s
            """, (campaign_id,))
            statuses = set(cursor.fetchone()[0] or [])
            state = ("running" if statuses & {"queued", "creating"} else
                     "partial" if statuses & {"failed", "interrupted"} and
                     statuses & {"ready"} else
                     "failed" if statuses & {"failed", "interrupted"} else
                     "cancelled" if statuses and statuses <= {"cancelled"} else
                     "succeeded" if statuses and statuses <= {"ready"} else
                     "queued")
            cursor.execute("""
                UPDATE enrollment_campaigns SET status=%s,updated_at=now()
                 WHERE id=%s
            """, (state, campaign_id))

    @staticmethod
    def _reconcile(cursor, identity_id: str) -> None:
        cursor.execute("""
            SELECT ledger.id, ledger.payload->'models', identity.name,
                   ledger.created_at
              FROM jobs ledger
              JOIN voice_identities identity ON identity.id = %s
             WHERE ledger.kind = 'clone_package'
               AND ledger.status IN ('queued', 'running')
               AND coalesce(ledger.voice_identity_id, ledger.voice) = %s
             FOR UPDATE OF ledger
        """, (identity_id, identity_id))
        for ledger_id, models, name, created_at in cursor.fetchall():
            requested = [str(model) for model in (models or []) if model]
            if not requested:
                continue
            cursor.execute("""
                SELECT count(*) FILTER (WHERE status = 'ready'),
                       count(*) FILTER
                           (WHERE status IN ('failed', 'interrupted')),
                       coalesce(bool_or(status = ANY(%s)), false)
                  FROM voice_package_jobs
                 WHERE identity_id = %s AND model_id = ANY(%s)
            """, (list(_ACTIVE), identity_id, requested))
            ready, failed, active = cursor.fetchone()
            if active:
                continue
            detail = (f"{name} · {ready} "
                      f"{'capability' if ready == 1 else 'capabilities'} ready")
            if failed:
                detail += f" · {failed} failed"
            cursor.execute("""
                UPDATE jobs SET status = %s, detail = %s, done = %s,
                       total = %s, finished_at = coalesce(finished_at, now()),
                       elapsed_ms = greatest(0, extract(epoch FROM
                           (now() - %s)) * 1000)::int
                 WHERE id = %s
            """, ("failed" if failed else "ok", detail, ready,
                  ready + failed, created_at, ledger_id))

    def abandon_running(self) -> int:
        """Make ambiguous provider calls explicit; never queue them automatically."""
        with transaction() as cursor:
            cursor.execute("""
                UPDATE voice_package_jobs
                   SET status = 'interrupted',
                       error = 'The app stopped before this variant finished; retry manually',
                       updated_at = now() WHERE status = 'creating'
                RETURNING identity_id
            """)
            identities = {row[0] for row in cursor.fetchall()}
            cursor.execute("""
                UPDATE jobs SET status = 'failed',
                       error = 'The app stopped before Alibaba confirmed this clone; retry manually',
                       finished_at = now()
                 WHERE kind = 'clone' AND status = 'running'
                   AND requested_route->>'executor' = 'voice-package-worker-v1'
            """)
            for identity_id in identities:
                self._reconcile(cursor, identity_id)
            return len(identities)
