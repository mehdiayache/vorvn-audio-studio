"""Worker readiness lease stored beside the durable queue."""

from __future__ import annotations

import json
import os

import psycopg

from origins.config import settings
from origins.infrastructure.postgres.session import read_only, transaction


WORKER_ID = "origins-primary"
# Session-level PostgreSQL lock. This prevents an orphaned development worker
# from consuming paid jobs after a newer application version has started.
WORKER_LOCK_KEY = 0x415544494F535455


class WorkerRuntimeRepository:
    def __init__(self, lock_key: int = WORKER_LOCK_KEY) -> None:
        self._lock_key = lock_key
        self._lock_connection: psycopg.Connection | None = None

    def acquire(self) -> bool:
        """Become the one queue consumer for this Origins database."""
        if self._lock_connection is not None:
            return True
        connection = psycopg.connect(settings.database_url, autocommit=True)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT pg_try_advisory_lock(%s)", (self._lock_key,))
                acquired = bool(cursor.fetchone()[0])
        except Exception:
            connection.close()
            raise
        if not acquired:
            connection.close()
            return False
        self._lock_connection = connection
        return True

    def release(self) -> None:
        connection = self._lock_connection
        self._lock_connection = None
        if connection is None:
            return
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT pg_advisory_unlock(%s)", (self._lock_key,))
        finally:
            connection.close()

    def heartbeat(self, *, status: str = "ready", detail: dict | None = None) -> None:
        with transaction() as cursor:
            cursor.execute("""
                INSERT INTO worker_leases
                    (worker_id, process_id, status, detail)
                VALUES (%s, %s, %s, %s::jsonb)
                ON CONFLICT (worker_id) DO UPDATE SET
                    started_at = CASE
                        WHEN worker_leases.process_id <> EXCLUDED.process_id
                        THEN now() ELSE worker_leases.started_at END,
                    process_id = EXCLUDED.process_id,
                    status = EXCLUDED.status,
                    last_seen_at = now(),
                    detail = EXCLUDED.detail
            """, (WORKER_ID, os.getpid(), status, json.dumps(detail or {})))

    def stop(self) -> None:
        try:
            with transaction() as cursor:
                cursor.execute("""
                    UPDATE worker_leases SET status = 'stopped', last_seen_at = now()
                     WHERE worker_id = %s AND process_id = %s
                """, (WORKER_ID, os.getpid()))
        finally:
            self.release()

    def status(self, stale_seconds: int = 10) -> dict:
        with read_only() as cursor:
            cursor.execute("""
                SELECT process_id, status, started_at, last_seen_at,
                       last_seen_at >= now() - make_interval(secs => %s), detail
                  FROM worker_leases WHERE worker_id = %s
            """, (stale_seconds, WORKER_ID))
            row = cursor.fetchone()
        if not row:
            return {"ready": False, "status": "missing"}
        detail = row[5] or {}
        expected_runtime_id = (
            os.getenv("ORIGINS_RUNTIME_ID") or "").strip()
        actual_runtime_id = str(detail.get("runtime_id") or "").strip()
        same_runtime = (
            not expected_runtime_id
            or actual_runtime_id == expected_runtime_id)
        ready = bool(row[4]) and row[1] == "ready" and same_runtime
        status = (
            "runtime_mismatch" if bool(row[4]) and row[1] == "ready"
            and not same_runtime
            else row[1] if row[4] else "stale")
        return {
            "ready": ready, "status": status,
            "process_id": row[0], "started_at": row[2].isoformat(),
            "last_seen_at": row[3].isoformat(), "detail": detail,
            "expected_runtime_id": expected_runtime_id or None,
            "actual_runtime_id": actual_runtime_id or None,
        }
