"""Authenticated provider webhooks; polling remains reconciliation fallback."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import APIRouter, Request, Response

from audio_studio.composition.provider_callbacks import provider_callback_recorder
from audio_studio.http.errors import ApiProblem


router = APIRouter(prefix="/api/v1/providers", tags=["provider-callbacks"])
_MAX_CLOCK_SKEW_SECONDS = 300


@router.post("/kie/callback", status_code=200, include_in_schema=False)
async def kie_callback(request: Request) -> Response:
    key = (os.getenv("KIE_WEBHOOK_HMAC_KEY") or "").strip()
    if not key:
        raise ApiProblem(
            503, "kie_callback_not_configured",
            "KIE callback verification is not configured.")
    raw = await request.body()
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ApiProblem(
            400, "invalid_kie_callback", "KIE sent an invalid callback.") from exc
    data = payload.get("data") if isinstance(payload, dict) else None
    source = data if isinstance(data, dict) else payload
    task_id = str(
        source.get("taskId") or source.get("task_id") or ""
    ).strip() if isinstance(source, dict) else ""
    timestamp = request.headers.get("X-Webhook-Timestamp", "").strip()
    signature = request.headers.get("X-Webhook-Signature", "").strip()
    attempt_id = request.query_params.get("attempt_id", "").strip()
    callback_token = request.query_params.get("token", "").strip()
    query_signature_valid = bool(
        attempt_id.isdigit() and callback_token and hmac.compare_digest(
            callback_token,
            hmac.new(key.encode(), attempt_id.encode(), hashlib.sha256).hexdigest(),
        ))
    try:
        timestamp_value = int(timestamp)
    except ValueError:
        timestamp_value = 0
    header_signature_valid = bool(
        timestamp_value
        and signature
        and abs(int(time.time()) - timestamp_value) <= _MAX_CLOCK_SKEW_SECONDS
        and hmac.compare_digest(signature, base64.b64encode(hmac.new(
            key.encode("utf-8"), f"{task_id}.{timestamp}".encode("utf-8"),
            hashlib.sha256,
        ).digest()).decode("ascii"))
    )
    if not task_id or not (query_signature_valid or header_signature_valid):
        raise ApiProblem(
            401, "invalid_kie_signature", "KIE callback signature is invalid.")
    provider_callback_recorder.record_callback(
        "kie", task_id, payload, attempt_id=attempt_id or None)
    return Response(status_code=200)
