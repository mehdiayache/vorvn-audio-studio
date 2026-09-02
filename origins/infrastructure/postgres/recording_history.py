"""PostgreSQL read model for reusable standalone Speak recordings."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from origins.infrastructure.postgres.session import read_only


_REQUEST_FIELDS = (
    "text", "text_raw", "text_shaped", "text_tagged", "text_state",
    "voice", "voice_identity_id", "binding_id", "catalogue_voice_id",
    "capability_id", "engine", "model", "format", "language",
    "instruction", "speech_mode", "rate", "pitch", "volume", "seed",
    "enable_ssml",
)


def _safe_request(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        **{field: payload.get(field) for field in _REQUEST_FIELDS},
        "confirmed": False,
    }


class RecordingHistoryRepository:
    def recordings(self, workspace_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT job.public_id, job.status, job.created_at,
                       job.started_at, job.finished_at, job.payload,
                       job.error, job.cost, job.cost_basis, job.result,
                       version.filename, version.duration_ms,
                       version.size_bytes, version.file_id,
                       continuation.public_id
                  FROM jobs job
                  LEFT JOIN LATERAL (
                    SELECT item.filename, item.duration_ms, item.size_bytes,
                           item.file_id AS file_id
                      FROM unnest(job.output_file_ids) output(file_id)
                      JOIN file_versions item ON item.file_id=output.file_id
                     ORDER BY item.version DESC, item.id DESC LIMIT 1
                  ) version ON true
                  LEFT JOIN LATERAL (
                    SELECT child.public_id FROM jobs child
                     WHERE child.parent_id=job.id
                     ORDER BY child.created_at DESC, child.id DESC LIMIT 1
                  ) continuation ON true
                 WHERE job.kind = 'speech'
                   AND job.creation_action_id = 'generate-speech'
                   AND job.workspace_id = %s
                   AND job.project_id IS NULL
                 ORDER BY job.created_at DESC, job.id DESC
            """, (workspace_id,))
            rows = cursor.fetchall()

        recordings = []
        for row in rows:
            result = row[9] or {}
            filename = row[10] or result.get("name")
            recordings.append({
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
                "needs_confirmation": bool(result.get("needs_confirmation")),
                "requires_review": bool(result.get("requires_review")
                                        or result.get("ambiguous")),
                "estimate": float(result.get("estimate")
                                  or result.get("estimated_cost") or 0),
                "file_id": int(row[13]) if row[13] else None,
                "continued_by_job_id": str(row[14]) if row[14] else None,
            })
        return recordings
