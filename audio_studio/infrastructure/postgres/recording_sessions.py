"""PostgreSQL read model for standalone recording sessions."""

from __future__ import annotations

from typing import Any
from uuid import UUID
from urllib.parse import quote

from audio_studio.infrastructure.postgres.session import read_only


_REQUEST_FIELDS = (
    "text", "text_raw", "text_shaped", "text_tagged", "text_state",
    "voice", "voice_identity_id", "binding_id", "catalogue_voice_id",
    "capability_id", "engine", "model", "format", "language",
    "instruction", "speech_mode", "rate", "pitch", "volume", "seed",
)


def _safe_request(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        **{field: payload.get(field) for field in _REQUEST_FIELDS},
        "insert_at": None,
        "confirmed": False,
    }


class RecordingSessionRepository:
    def attempts(self, session_id: UUID) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT job.public_id, job.status, job.created_at,
                       job.started_at, job.finished_at, job.payload,
                       job.error, job.cost, job.cost_basis, job.result,
                       take.filename, take.duration_ms,
                       take.size_bytes,
                       continuation.public_id
                  FROM jobs job
                  LEFT JOIN takes take ON take.id = job.take_id
                  LEFT JOIN LATERAL (
                    SELECT child.public_id FROM jobs child
                     WHERE child.parent_id=job.id
                     ORDER BY child.created_at DESC, child.id DESC LIMIT 1
                  ) continuation ON true
                 WHERE job.kind = 'speech'
                   AND job.source_tool = 'speak'
                   AND job.production_id IS NULL
                   AND job.payload->>'session_id' = %s
                 ORDER BY job.created_at DESC, job.id DESC
            """, (str(session_id),))
            rows = cursor.fetchall()

        attempts = []
        for row in rows:
            result = row[9] or {}
            filename = row[10] or result.get("name")
            attempts.append({
                "id": str(row[0]),
                "status": row[1],
                "created_at": row[2].isoformat(),
                "started_at": row[3].isoformat() if row[3] else None,
                "finished_at": row[4].isoformat() if row[4] else None,
                "request": _safe_request(row[5] or {}),
                "error": str(row[6] or ""),
                "cost": float(row[7] or 0),
                "cost_basis": row[8] or "unknown",
                "warning": str(result.get("warning") or ""),
                "duration_ms": int(row[11] or result.get("duration_ms") or 0),
                "size_bytes": int(row[12] or 0),
                "audio_url": f"/audio/{quote(str(filename))}" if filename else None,
                "fidelity": result.get("fidelity") or None,
                "needs_confirmation": bool(result.get("needs_confirmation")),
                "requires_review": bool(result.get("requires_review")
                                        or result.get("ambiguous")),
                "estimate": float(result.get("estimate")
                                  or result.get("estimated_cost") or 0),
                "continued_by_job_id": str(row[13]) if row[13] else None,
            })
        return attempts
