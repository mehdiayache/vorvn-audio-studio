"""Atomic spend reservations and provider-attempt evidence."""

from __future__ import annotations

import hashlib
import json

from audio_studio.infrastructure.postgres.session import transaction


class ProviderOperationRepository:
    def reserve_budget(self, job_id: int, operation: str, amount: float,
                       daily_cap: float) -> str:
        with transaction() as cursor:
            cursor.execute("SELECT id FROM jobs WHERE id=%s FOR UPDATE", (job_id,))
            if not cursor.fetchone():
                raise LookupError("That paid Job no longer exists.")
            cursor.execute("SELECT pg_advisory_xact_lock(hashtext('audio-studio-daily-spend'))")
            cursor.execute("""
                SELECT coalesce((SELECT sum(job.cost) FROM jobs job
                    WHERE job.created_at::date=current_date
                      AND NOT EXISTS (
                          SELECT 1 FROM budget_reservations reservation
                           WHERE reservation.job_id=job.id
                             AND reservation.status IN ('reserved','ambiguous'))),0)
                     + coalesce((SELECT sum(greatest(
                           estimated_cost,coalesce(actual_cost,0)))
                          FROM budget_reservations
                    WHERE status IN ('reserved','ambiguous')
                      AND created_at::date=current_date),0)
            """)
            committed = float(cursor.fetchone()[0] or 0)
            if daily_cap > 0 and committed + amount > daily_cap:
                raise PermissionError(
                    f"Daily cap reached: ${committed:.4f} committed and "
                    f"${amount:.4f} requested against ${daily_cap:.2f}.")
            cursor.execute("""
                INSERT INTO budget_reservations
                    (job_id, operation, estimated_cost, confirmed_at)
                VALUES (%s,%s,%s,now()) RETURNING id
            """, (job_id, operation, amount))
            return str(cursor.fetchone()[0])

    def release_budget(self, reservation_id: str, actual_cost: float,
                       status: str) -> None:
        target = "ambiguous" if status == "ambiguous" else "reconciled"
        with transaction() as cursor:
            cursor.execute("""
                UPDATE budget_reservations
                   SET actual_cost=%s, status=%s, updated_at=now()
                 WHERE id=%s AND status='reserved'
            """, (actual_cost, target, int(reservation_id)))

    def begin_attempt(self, job_id: int, operation: str, route: dict,
                      payload: dict, reservation_id: str | None) -> str:
        fingerprint = hashlib.sha256(json.dumps(
            payload, sort_keys=True, default=str,
            separators=(",", ":")).encode("utf-8")).hexdigest()
        with transaction() as cursor:
            cursor.execute("""
                SELECT previous.id
                  FROM provider_attempts previous
                  JOIN jobs previous_job ON previous_job.id=previous.job_id
                  JOIN jobs current_job ON current_job.id=%s
                 WHERE previous.operation=%s
                   AND previous.payload_fingerprint=%s
                   AND previous.status IN ('ambiguous','definitive_failed')
                   AND previous_job.organization_id=current_job.organization_id
                 ORDER BY previous.created_at DESC LIMIT 1
            """, (job_id, operation, fingerprint))
            previous = cursor.fetchone()
            previous_id = previous[0] if previous else None
            cursor.execute("""
                INSERT INTO provider_attempts
                    (job_id, previous_attempt_id, operation, provider, provider_region, route,
                     payload_fingerprint, idempotency_key, status,
                     estimated_cost, diagnostics)
                VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s,%s,'not_sent',
                        coalesce((SELECT estimated_cost FROM budget_reservations
                                  WHERE id=%s),0),%s::jsonb)
                RETURNING id
            """, (job_id, previous_id, operation, route.get("provider"), route.get("region"),
                  json.dumps(route), fingerprint,
                  f"job:{job_id}:{operation}:{fingerprint[:16]}",
                  int(reservation_id) if reservation_id else None,
                  json.dumps({"budget_reservation_id": reservation_id})))
            attempt_id = str(cursor.fetchone()[0])
            cursor.execute("UPDATE jobs SET provider_attempt_id=%s WHERE id=%s",
                           (int(attempt_id), job_id))
            return attempt_id

    def mark_sent(self, attempt_id: str) -> None:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE provider_attempts SET status='sent', sent_at=now()
                 WHERE id=%s AND status='not_sent'
            """, (int(attempt_id),))

    def finish_attempt(self, attempt_id: str, status: str, *, cost: float,
                       usage: dict, request_ids: list[str], error: dict) -> None:
        if status not in {"succeeded", "definitive_failed", "ambiguous"}:
            raise ValueError("Invalid terminal ProviderAttempt state.")
        with transaction() as cursor:
            cursor.execute("""
                UPDATE provider_attempts
                   SET status=%s, finished_at=now(), cost=%s, usage=%s::jsonb,
                       provider_request_id=%s, error=%s::jsonb,
                       diagnostics=diagnostics || %s::jsonb
                 WHERE id=%s AND status IN ('not_sent','sent')
            """, (status, cost, json.dumps(usage or {}),
                  request_ids[0] if len(request_ids) == 1 else None,
                  json.dumps(error or {}), json.dumps({"request_ids": request_ids}),
                  int(attempt_id)))
