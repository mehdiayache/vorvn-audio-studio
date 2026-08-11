"""PostgreSQL operational-ledger read model and maintenance."""

from __future__ import annotations

from typing import Any

from audio_studio.infrastructure.postgres.session import read_only, transaction


KIND_LABELS = {
    "speech": "Speech", "batch": "Batch", "transcribe": "Subtitles",
    "translate": "Translation", "rewrite": "Text preparation",
    "render": "Production render", "clone": "Voice cloning",
}


def _basis(value: str | None) -> str:
    lowered = (value or "unknown").lower()
    if "mixed" in lowered:
        return "mixed_usage"
    if "actual" in lowered or "token" in lowered:
        return "actual_usage"
    if "catalog" in lowered or "duration" in lowered or "character" in lowered:
        return "catalog_usage"
    if "estimate" in lowered:
        return "estimate"
    if "not billed" in lowered or "free" in lowered:
        return "not_billed"
    return "historical_unknown"


def _public_error(value: str | None, public_id) -> tuple[str, str | None]:
    raw = str(value or "").strip()
    if not raw:
        return "", None
    lowered = raw.casefold()
    technical = any(marker in lowered for marker in (
        "foreignkeyviolation", "notnullviolation", "uniqueviolation",
        "psycopg.", "constraint", "relation \"", "traceback",
    ))
    if technical:
        diagnostic = f"job-{str(public_id)[:8]}"
        return ("Audio Studio could not save this result. "
                f"Use diagnostic ID {diagnostic} if the problem repeats.", diagnostic)
    return raw, None


def _run(row) -> dict[str, Any]:
    (internal_id, public_id, when, kind, status, operation_label, source_tool,
     model, voice, detail, error, estimated, cost, chars, seconds, elapsed_ms,
     actor_id, organization_id, provider_request_id, provider_region,
     provider_endpoint, price_version, currency, output_ids, usage,
     production_id, production_name, cost_basis, created_at, started_at,
     finished_at, provider_diagnostics, provider_request_ids,
     provider_attempt_status, provider_attempt_id) = row
    label = KIND_LABELS.get(kind, kind.replace("_", " ").title())
    public_error, diagnostic_id = _public_error(error, public_id)
    return {
        "id": str(public_id), "internal_id": internal_id,
        "when": when.isoformat(), "created_at": created_at.isoformat(),
        "started_at": started_at.isoformat() if started_at else None,
        "finished_at": finished_at.isoformat() if finished_at else None,
        "kind": kind, "kind_label": label,
        "operation": operation_label or label,
        "source_tool": source_tool or "audio-studio", "status": status,
        "model": model, "voice": voice, "detail": detail,
        "error": public_error, "diagnostic_id": diagnostic_id,
        "estimated": float(estimated or 0), "cost": float(cost or 0),
        "chars": int(chars or 0), "seconds": float(seconds or 0),
        "elapsed_ms": elapsed_ms, "actor_id": actor_id,
        "actor_label": "You" if actor_id == "local-owner" else actor_id or "System",
        "organization_id": organization_id,
        "provider_request_id": provider_request_id,
        "provider_region": provider_region,
        "provider_endpoint": provider_endpoint,
        "price_version": price_version, "currency": currency or "USD",
        "output_ids": output_ids or [], "usage": usage or {},
        "provider_diagnostics": provider_diagnostics or [],
        "provider_request_ids": provider_request_ids or [],
        "provider_attempt_status": provider_attempt_status,
        "provider_attempt_id": str(provider_attempt_id) if provider_attempt_id else None,
        "requires_review": provider_attempt_status == "ambiguous",
        "production_id": production_id, "production_name": production_name,
        "where": production_name or source_tool or "Audio Studio",
        "cost_basis": _basis(cost_basis),
        "cost_basis_raw": cost_basis or "unknown", "children": 0,
    }


class ActivityRepository:
    def snapshot(self, *, limit: int = 80, kind: str = "",
                 failed_only: bool = False) -> dict:
        where, parameters = ["1=1"], []
        if kind:
            where.append("job.kind = %s")
            parameters.append(kind)
        if failed_only:
            where.append(
                "job.status IN ('failed', 'warning', 'blocked', 'lost')")
        query = f"""
            SELECT job.id, job.public_id, job.created_at, job.kind, job.status,
                   job.operation_label, job.source_tool, job.model, job.voice,
                   job.detail, job.error, job.estimated, job.cost, job.chars,
                   job.seconds, job.elapsed_ms, job.actor_id,
                   job.organization_id, job.provider_request_id,
                   job.provider_region, job.provider_endpoint,
                   job.price_version, job.currency, job.output_ids, job.usage,
                   job.production_id, production.name, job.cost_basis,
                   job.created_at, job.started_at, job.finished_at,
                   job.result->'provider_diagnostics',
                   job.result->'request_ids', attempt.status, attempt.public_id
              FROM jobs job
              LEFT JOIN productions production
                ON production.id = job.production_id
              LEFT JOIN LATERAL (
                SELECT status, public_id FROM provider_attempts
                 WHERE job_id=job.id ORDER BY created_at DESC, id DESC LIMIT 1
              ) attempt ON true
             WHERE {' AND '.join(where)}
             ORDER BY job.created_at DESC LIMIT %s
        """
        with read_only() as cursor:
            cursor.execute(query, (*parameters, limit))
            runs = [_run(row) for row in cursor.fetchall()]
            cursor.execute("""
                SELECT coalesce(sum(cost) FILTER
                           (WHERE created_at::date = current_date), 0),
                       coalesce(sum(cost) FILTER
                           (WHERE date_trunc('month', created_at) =
                                  date_trunc('month', now())), 0),
                       coalesce(sum(cost), 0), count(*),
                       count(*) FILTER
                           (WHERE status IN
                              ('failed','warning','blocked','lost'))
                  FROM jobs
            """)
            totals = cursor.fetchone()
            cursor.execute("""
                SELECT coalesce(cost_basis, 'unknown'), count(*),
                       coalesce(sum(cost), 0)
                  FROM jobs
                 GROUP BY coalesce(cost_basis, 'unknown') ORDER BY 1
            """)
            breakdown = [{
                "basis": _basis(row[0]), "raw_basis": row[0],
                "runs": row[1], "cost": float(row[2] or 0),
            } for row in cursor.fetchall()]
            cursor.execute("""
                SELECT kind, count(*), coalesce(sum(cost), 0),
                       count(*) FILTER
                           (WHERE status IN
                              ('failed','warning','blocked','lost'))
                  FROM jobs GROUP BY kind ORDER BY kind
            """)
            by_kind = [{
                "kind": row[0], "runs": row[1],
                "cost": float(row[2] or 0), "problems": row[3],
            } for row in cursor.fetchall()]
        return {
            "today": float(totals[0]), "month": float(totals[1]),
            "total": float(totals[2]), "runs": totals[3],
            "problems": totals[4],
            "running": [item for item in runs if item["status"] in {
                "queued", "running", "retrying"}],
            "runs_list": runs, "kinds": KIND_LABELS,
            "cost_breakdown": breakdown, "by_kind": by_kind, "by_day": [],
        }
