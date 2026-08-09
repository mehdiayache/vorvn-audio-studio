"""Worker readiness lease stored beside the durable queue."""

from __future__ import annotations

import json
import os

from audio_studio.infrastructure.postgres.session import read_only, transaction


WORKER_ID = "audio-studio-primary"


class WorkerRuntimeRepository:
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
        with transaction() as cursor:
            cursor.execute("""
                UPDATE worker_leases SET status = 'stopped', last_seen_at = now()
                 WHERE worker_id = %s AND process_id = %s
            """, (WORKER_ID, os.getpid()))

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
        ready = bool(row[4]) and row[1] == "ready"
        return {
            "ready": ready, "status": row[1] if row[4] else "stale",
            "process_id": row[0], "started_at": row[2].isoformat(),
            "last_seen_at": row[3].isoformat(), "detail": row[5] or {},
        }
