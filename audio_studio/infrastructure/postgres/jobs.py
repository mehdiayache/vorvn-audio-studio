"""PostgreSQL durable Job queue using SKIP LOCKED, no Redis required."""

from __future__ import annotations

import json
from typing import Any, Iterable
from uuid import UUID

from audio_studio.domain.jobs import Job, JobCancelled, JobStatus
from audio_studio.infrastructure.postgres.session import read_only, transaction
from services.alibaba import config as alibaba_config
from audio_studio.application.transcription import FUN_MODEL, QWEN_MODEL


_SELECT = """
    SELECT id, public_id, kind, status, payload, result,
           CASE WHEN total > 0 THEN done::float / total ELSE 0 END,
           coalesce(detail, ''), coalesce(error, ''), retries,
           created_at, started_at, finished_at
      FROM jobs
"""
_EXECUTOR = "audio-studio-worker-v1"
_DEFAULT_ACTOR = "local-owner"
_DEFAULT_ORGANIZATION = "local-studio"


def _output_ids(kind: str, result: dict[str, Any]) -> list[dict[str, Any]]:
    identifier = result.get("id")
    if identifier in (None, ""):
        return []
    resource = {"transcribe": "transcript", "translate": "transcript",
                "speech": "part"}.get(kind, "output")
    return [{"type": resource, "id": identifier}]


def _requested_model(kind: str, payload: dict[str, Any]) -> str | None:
    if kind in {"speech", "batch"} and payload.get("engine") in {"audio", "omni"}:
        return alibaba_config.model_id(str(payload["engine"]), str(payload.get("model") or "plus"))
    if kind == "transcribe":
        return FUN_MODEL if payload.get("vocabulary_id") else QWEN_MODEL
    return str(payload.get("model") or payload.get("quality") or "") or None


def _job(row) -> Job:
    return Job(row[0], row[1], row[2], JobStatus(row[3]), row[4] or {},
               row[5] or {}, float(row[6] or 0), row[7], row[8], int(row[9]),
               row[10], row[11], row[12])


class JobRepository:
    def heartbeat(self, job_id: int) -> bool:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE jobs SET last_heartbeat_at = now()
                 WHERE id = %s AND status = 'running'
            """, (job_id,))
            return cursor.rowcount == 1

    def enqueue(self, kind: str, payload: dict[str, Any], *,
                idempotency_key: str, actor_id: str | None = None,
                organization_id: str | None = None,
                project_id: int | None = None,
                production_id: int | None = None,
                source_tool: str | None = None,
                operation_label: str | None = None) -> tuple[Job, bool]:
        actor_id = actor_id or _DEFAULT_ACTOR
        organization_id = organization_id or _DEFAULT_ORGANIZATION
        requested_model = _requested_model(kind, payload)
        requested_route = {
            "executor": _EXECUTOR,
            "source_tool": source_tool or "audio-studio",
            "engine": payload.get("engine"),
            "model": requested_model,
        }
        with transaction() as cursor:
            cursor.execute(_SELECT + " WHERE idempotency_key = %s",
                           (idempotency_key,))
            existing = cursor.fetchone()
            if existing:
                return _job(existing), False
            cursor.execute("""
                INSERT INTO jobs
                    (kind, status, payload, idempotency_key, actor_id,
                     organization_id, project_id, production_id, estimated, cost,
                     requested_route, resolved_route, source_tool, operation_label,
                     model, voice, engine, tier)
                VALUES (%s, 'queued', %s::jsonb, %s, %s, %s, %s, %s, 0, 0,
                        %s::jsonb, '{}'::jsonb, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (kind, json.dumps(payload), idempotency_key, actor_id,
                  organization_id, project_id, production_id,
                  json.dumps(requested_route), source_tool, operation_label,
                  requested_model, payload.get("voice"), payload.get("engine"),
                  payload.get("model")))
            job_id = cursor.fetchone()[0]
            self._audit(cursor, actor_id, organization_id, "job.enqueued",
                        job_id, {"kind": kind, "source_tool": source_tool,
                                 "operation": operation_label})
            cursor.execute(_SELECT + " WHERE id = %s", (job_id,))
            return _job(cursor.fetchone()), True

    def get(self, public_id: UUID) -> Job | None:
        with read_only() as cursor:
            cursor.execute(_SELECT + " WHERE public_id = %s", (public_id,))
            row = cursor.fetchone()
            return _job(row) if row else None

    def claim_next(self, kinds: Iterable[str]) -> Job | None:
        kinds = list(kinds)
        if not kinds:
            return None
        with transaction() as cursor:
            cursor.execute("""
                SELECT id FROM jobs
                 WHERE status IN ('queued', 'retrying')
                   AND available_at <= now() AND kind = ANY(%s)
                   AND requested_route->>'executor' = %s
                 ORDER BY created_at
                 FOR UPDATE SKIP LOCKED LIMIT 1
            """, (kinds, _EXECUTOR))
            row = cursor.fetchone()
            if not row:
                return None
            cursor.execute("""
                UPDATE jobs SET status = 'running', started_at = coalesce(started_at, now()),
                                last_heartbeat_at = now()
                 WHERE id = %s
            """, (row[0],))
            cursor.execute(_SELECT + " WHERE id = %s", (row[0],))
            return _job(cursor.fetchone())

    def progress(self, job_id: int, done: int, total: int,
                 detail: str = "") -> None:
        with transaction() as cursor:
            cursor.execute(
                "SELECT status, cancel_requested FROM jobs WHERE id = %s FOR UPDATE",
                (job_id,),
            )
            state = cursor.fetchone()
            if not state or state[0] != "running":
                raise JobCancelled("This Job is no longer running.")
            if state[1]:
                cursor.execute("""
                    UPDATE jobs SET status = 'cancelled', finished_at = now(),
                           last_heartbeat_at = now(),
                           detail = 'Cancelled by operator'
                     WHERE id = %s AND status = 'running'
                """, (job_id,))
                cursor.execute("""
                    INSERT INTO job_events (job_id, kind, detail)
                    VALUES (%s, 'cancelled', '{"reason":"operator"}'::jsonb)
                """, (job_id,))
                raise JobCancelled("Cancelled by operator.")
            cursor.execute("""
                UPDATE jobs SET done = %s, total = %s, detail = %s,
                                last_heartbeat_at = now()
                 WHERE id = %s AND status = 'running'
            """, (done, total, detail[:300] or None, job_id))
            cursor.execute("""
                INSERT INTO job_events (job_id, kind, progress, detail)
                VALUES (%s, 'progress', %s, %s::jsonb)
            """, (job_id, done / total if total else 0,
                  json.dumps({"done": done, "total": total, "message": detail})))

    def finish(self, job_id: int, result: dict[str, Any], *,
               cost: float = 0, usage: dict | None = None,
               provider_request_id: str | None = None,
               status: str = "ok") -> bool:
        with transaction() as cursor:
            cursor.execute("""
                SELECT kind, actor_id, organization_id, cancel_requested
                  FROM jobs WHERE id = %s FOR UPDATE
            """, (job_id,))
            job_row = cursor.fetchone()
            if not job_row:
                return False
            kind = job_row[0] if job_row else "job"
            outputs = _output_ids(kind, result)
            final_status = "cancelled" if job_row[3] else status
            cursor.execute("""
                UPDATE jobs SET status = %s, result = %s::jsonb, cost = %s,
                       estimated = greatest(estimated, %s),
                       chars = greatest(chars, %s),
                       model = coalesce(%s, model),
                       engine = coalesce(%s, engine),
                       voice = coalesce(%s, voice),
                       usage = %s::jsonb, provider_request_id = %s,
                       cost_basis = %s, price_version = %s,
                       provider_region = %s, provider_endpoint = %s,
                       resolved_route = %s::jsonb, output_ids = %s::jsonb,
                       generation_id = coalesce(%s, generation_id),
                       finished_at = now(), last_heartbeat_at = now(),
                       elapsed_ms = greatest(0, extract(epoch from
                           (now() - coalesce(started_at, created_at))) * 1000)::int
                 WHERE id = %s AND status = 'running'
            """, (final_status, json.dumps(result), cost,
                  float(result.get("estimated_cost") or result.get("estimate") or 0),
                  int(result.get("chars") or 0), result.get("model") or None,
                  result.get("engine") or None, result.get("voice") or None,
                  json.dumps(usage or {}),
                  provider_request_id or result.get("provider_request_id"),
                  result.get("cost_basis") or "unknown", result.get("price_version"),
                  result.get("provider_region"), result.get("provider_endpoint"),
                  json.dumps({"model": result.get("model"),
                              "region": result.get("provider_region")}),
                  json.dumps(outputs), result.get("id"), job_id))
            if cursor.rowcount != 1:
                return False
            event_kind = "cancelled" if final_status == "cancelled" else "completed"
            cursor.execute("INSERT INTO job_events (job_id, kind, progress) VALUES (%s, %s, 1)",
                           (job_id, event_kind))
            if job_row:
                self._audit(cursor, job_row[1], job_row[2], "job.completed",
                            job_id, {"kind": kind, "status": final_status,
                                     "cost": cost, "outputs": outputs})
            return True

    def fail(self, job_id: int, error: str, retry: bool = False) -> None:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE jobs SET status = %s, error = %s, retries = retries + 1,
                       available_at = CASE WHEN %s THEN now() + interval '10 seconds' ELSE available_at END,
                       finished_at = CASE WHEN %s THEN NULL ELSE now() END
                 WHERE id = %s AND status = 'running'
            """, ("retrying" if retry else "failed", error[:400], retry, retry, job_id))
            if cursor.rowcount != 1:
                return
            cursor.execute("INSERT INTO job_events (job_id, kind, detail) VALUES (%s, %s, %s::jsonb)",
                           (job_id, "retrying" if retry else "failed",
                            json.dumps({"error": error[:400]})))
            cursor.execute("SELECT actor_id, organization_id, kind FROM jobs WHERE id = %s", (job_id,))
            row = cursor.fetchone()
            if row:
                self._audit(cursor, row[0], row[1], "job.failed", job_id,
                            {"kind": row[2], "error": error[:400]})

    def abandon_stale(self, older_than_seconds: int = 120) -> int:
        """Expire only Jobs whose worker lease stopped being refreshed."""
        with transaction() as cursor:
            cursor.execute("""
                UPDATE jobs SET status = 'lost', finished_at = now(),
                       error = 'The worker stopped before this Job finished.'
                 WHERE status = 'running'
                   AND coalesce(last_heartbeat_at, started_at, created_at)
                       < now() - make_interval(secs => %s)
            """, (older_than_seconds,))
            return cursor.rowcount

    def cancel(self, public_id: UUID) -> Job | None:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE jobs SET cancel_requested = true,
                       status = CASE WHEN status IN ('queued', 'retrying')
                                     THEN 'cancelled' ELSE status END,
                       finished_at = CASE WHEN status IN ('queued', 'retrying')
                                          THEN now() ELSE finished_at END
                 WHERE public_id = %s
            """, (public_id,))
            cursor.execute(_SELECT + " WHERE public_id = %s", (public_id,))
            row = cursor.fetchone()
            if row:
                cursor.execute("SELECT actor_id, organization_id FROM jobs WHERE public_id = %s", (public_id,))
                owner = cursor.fetchone()
                if owner:
                    self._audit(cursor, owner[0], owner[1], "job.cancel_requested",
                                row[0], {})
            return _job(row) if row else None

    @staticmethod
    def _audit(cursor, actor_id: str | None, organization_id: str | None,
               action: str, job_id: int, detail: dict[str, Any]) -> None:
        cursor.execute("""
            INSERT INTO audit_records
                (actor_id, organization_id, action, resource_type, resource_id, detail)
            VALUES (%s, %s, %s, 'job', %s, %s::jsonb)
        """, (actor_id, organization_id, action, str(job_id), json.dumps(detail)))

    def events(self, public_id: UUID) -> list[dict[str, Any]]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT event.id, event.created_at, event.kind, event.progress, event.detail
                  FROM job_events event JOIN jobs job ON job.id = event.job_id
                 WHERE job.public_id = %s ORDER BY event.id
            """, (public_id,))
            return [{"id": row[0], "created_at": row[1].isoformat(),
                     "kind": row[2], "progress": row[3], "detail": row[4] or {}}
                    for row in cursor.fetchall()]
