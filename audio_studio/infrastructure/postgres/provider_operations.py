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
                WITH terminal AS (
                  SELECT attempt.job_id, sum(CASE
                      WHEN attempt.status='ambiguous' THEN greatest(
                          attempt.estimated_cost, coalesce(attempt.cost,0))
                      ELSE coalesce(attempt.cost,0) END) AS spend
                    FROM provider_attempts attempt
                   WHERE attempt.status IN
                         ('succeeded','definitive_failed','ambiguous')
                     AND attempt.created_at::date=current_date
                   GROUP BY attempt.job_id
                ), active AS (
                  SELECT reservation.job_id, max(greatest(
                        reservation.estimated_cost,
                        coalesce(reservation.actual_cost,0),
                        coalesce(terminal.spend,0))) AS spend
                    FROM budget_reservations reservation
                    LEFT JOIN terminal ON terminal.job_id=reservation.job_id
                   WHERE reservation.status IN ('reserved','ambiguous')
                     AND reservation.created_at::date=current_date
                   GROUP BY reservation.job_id
                )
                SELECT coalesce((SELECT sum(spend) FROM active),0)
                     + coalesce((SELECT sum(terminal.spend) FROM terminal
                                  WHERE NOT EXISTS (
                                      SELECT 1 FROM active
                                       WHERE active.job_id=terminal.job_id)),0)
                     + coalesce((SELECT sum(job.cost) FROM jobs job
                                  WHERE job.created_at::date=current_date
                                    AND NOT EXISTS (
                                        SELECT 1 FROM provider_attempts attempt
                                         WHERE attempt.job_id=job.id)),0)
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

    def begin_attempt(self, job_id: int, operation: str, route: dict,
                      payload: dict, reservation_id: str | None,
                      estimated_cost: float | None = None) -> str:
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
                        coalesce(%s,(SELECT estimated_cost
                                     FROM budget_reservations WHERE id=%s),0),
                        %s::jsonb)
                RETURNING id
            """, (job_id, previous_id, operation, route.get("provider"), route.get("region"),
                  json.dumps(route), fingerprint,
                  f"job:{job_id}:{operation}:{fingerprint[:16]}",
                  estimated_cost,
                  int(reservation_id) if reservation_id else None,
                  json.dumps({"budget_reservation_id": reservation_id})))
            attempt_id = str(cursor.fetchone()[0])
            cursor.execute("UPDATE jobs SET provider_attempt_id=%s WHERE id=%s",
                           (int(attempt_id), job_id))
            return attempt_id

    def mark_sent(self, attempt_id: str,
                  provider_request_id: str | None = None) -> None:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE provider_attempts
                   SET status='sent', sent_at=now(),
                       provider_request_id=coalesce(%s, provider_request_id)
                 WHERE id=%s AND status='not_sent'
            """, (provider_request_id, int(attempt_id)))

    def attempt_for_job(self, job_id: int, operation: str) -> dict | None:
        with transaction() as cursor:
            cursor.execute("""
                SELECT id, status, provider, provider_request_id, route,
                       diagnostics, usage, cost, error
                  FROM provider_attempts
                 WHERE job_id=%s AND operation=%s
                 ORDER BY created_at DESC, id DESC LIMIT 1
            """, (job_id, operation))
            row = cursor.fetchone()
        if not row:
            return None
        return {
            "id": str(row[0]), "status": row[1], "provider": row[2],
            "provider_request_id": row[3], "route": row[4] or {},
            "diagnostics": row[5] or {}, "usage": row[6] or {},
            "cost": float(row[7] or 0), "error": row[8] or {},
        }

    def record_callback(self, provider: str, provider_request_id: str,
                        payload: dict) -> bool:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE provider_attempts
                   SET diagnostics=diagnostics || %s::jsonb
                 WHERE id=(
                       SELECT id FROM provider_attempts
                        WHERE provider=%s AND provider_request_id=%s
                        ORDER BY created_at DESC, id DESC LIMIT 1)
                   AND status IN ('sent','succeeded')
            """, (json.dumps({"provider_callback": payload}),
                  provider, provider_request_id))
            return cursor.rowcount == 1

    def finish_attempt(self, attempt_id: str, status: str, *, cost: float,
                       usage: dict, request_ids: list[str], error: dict,
                       receipt: dict | None = None,
                       reconcile_budget: bool = True) -> None:
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
                  json.dumps(error or {}), json.dumps({
                      "request_ids": request_ids,
                      **({"provider_result": receipt} if receipt else {}),
                  }),
                  int(attempt_id)))
            if cursor.rowcount != 1:
                return
            if reconcile_budget:
                self._reconcile_budget(
                    cursor, cost, status, attempt_id=int(attempt_id))

    def record_artifact(self, attempt_id: str, artifact: dict) -> None:
        """Attach local recovery evidence without changing provider truth."""
        with transaction() as cursor:
            cursor.execute("""
                UPDATE provider_attempts
                   SET diagnostics=diagnostics || %s::jsonb
                 WHERE id=%s AND status='succeeded'
            """, (json.dumps({"local_artifact": artifact}), int(attempt_id)))

    def reconcile_budget(self, job_id: int, actual_cost: float,
                         status: str) -> None:
        with transaction() as cursor:
            self._reconcile_budget(
                cursor, actual_cost, status, job_id=job_id)

    @staticmethod
    def _reconcile_budget(cursor, actual_cost: float, status: str, *,
                          attempt_id: int | None = None,
                          job_id: int | None = None) -> None:
        if status not in {"succeeded", "definitive_failed", "ambiguous"}:
            raise ValueError("Invalid budget reconciliation state.")
        if attempt_id is not None:
            cursor.execute("""
                UPDATE budget_reservations reservation
                   SET actual_cost=%s,
                       status=CASE WHEN %s='ambiguous'
                                   THEN 'ambiguous' ELSE 'reconciled' END,
                       updated_at=now()
                  FROM provider_attempts attempt
                 WHERE attempt.id=%s
                   AND reservation.job_id=attempt.job_id
                   AND reservation.status='reserved'
            """, (actual_cost, status, attempt_id))
        else:
            cursor.execute("""
                UPDATE budget_reservations
                   SET actual_cost=%s,
                       status=CASE WHEN %s='ambiguous'
                                   THEN 'ambiguous' ELSE 'reconciled' END,
                       updated_at=now()
                 WHERE job_id=%s AND status='reserved'
            """, (actual_cost, status, job_id))
