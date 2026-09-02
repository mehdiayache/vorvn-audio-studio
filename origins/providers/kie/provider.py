"""KIE authentication and unified task lifecycle."""

from __future__ import annotations

import json
import hashlib
import hmac
import os
from pathlib import Path
from typing import Any
import urllib.error
import urllib.parse
import urllib.request

from origins.providers.media_generation import (
    MediaGenerationProviderError, MediaGenerationProviderSetupError,
    MediaGenerationProviderState, MediaGenerationSubmission,
)


DEFAULT_BASE_URL = "https://api.kie.ai"
MAX_OUTPUT_BYTES = 1_000_000_000
DOWNLOAD_USER_AGENT = "Origins/1.0"
KIE_CREDIT_USD = 0.005
# Pricing evidence for this enabled model family:
# - source: https://kie.ai/kling-o3
# - provider pricing overview: https://kie.ai/
# - retrieved: 2026-08-29
# - snapshot: Origins operator-verified KIE Kling O3 rate matrix. The public page
#   exposes the $0.07/s floor but not every matrix cell, so each value remains
#   covered by tests and must be rechecked before changing or enabling a model.
# Provider-owned prices never leak into the Creator domain or React contract.
KLING_OMNI_USD_PER_SECOND = {
    ("720p", False): 0.07,
    ("720p", True): 0.10,
    ("1080p", False): 0.09,
    ("1080p", True): 0.135,
    ("4k", False): 0.335,
    ("4k", True): 0.335,
}
KIE_MODEL_PRICING_STRATEGIES = {
    "kling-3.0-omni/text-to-video": "kling_omni_per_second",
    "kling-3.0-omni/image-to-video": "kling_omni_per_second",
    "kling-3.0-omni/reference-to-video": "kling_omni_per_second",
    "kling-3.0-omni/transformation": "kling_omni_per_second",
}


class KieMediaGenerationProvider:
    provider_id = "kie"

    def __init__(self, *, base_url: str | None = None,
                 opener=urllib.request.urlopen):
        self.base_url = (base_url or os.getenv("KIE_API_BASE_URL")
                         or DEFAULT_BASE_URL).rstrip("/")
        self.opener = opener

    @staticmethod
    def configured() -> bool:
        return bool((os.getenv("KIE_API_KEY") or "").strip())

    @staticmethod
    def callback_configured() -> bool:
        return bool(
            (os.getenv("KIE_CALLBACK_URL") or "").strip()
            and (os.getenv("KIE_WEBHOOK_HMAC_KEY") or "").strip())

    @staticmethod
    def estimate_cost(request: dict[str, Any]) -> float:
        model = str(request.get("model") or "").strip()
        strategy = KIE_MODEL_PRICING_STRATEGIES.get(model)
        if strategy != "kling_omni_per_second":
            raise MediaGenerationProviderError(
                "KIE pricing is not configured for this model.")
        values = request.get("input") or {}
        rate = KLING_OMNI_USD_PER_SECOND.get((
            str(values.get("resolution") or "720p"),
            bool(values.get("audio")),
        ))
        if rate is None:
            raise MediaGenerationProviderError(
                "KIE pricing is not configured for these model settings.")
        return round(rate * int(values.get("duration") or 0), 6)

    @staticmethod
    def _key() -> str:
        key = (os.getenv("KIE_API_KEY") or "").strip()
        if not key:
            raise MediaGenerationProviderSetupError(
                "Add the KIE API key in Settings before generating.")
        return key

    def _request(
        self, path: str, *, method: str = "GET",
        body: dict[str, Any] | None = None,
    ) -> urllib.request.Request:
        headers = {
            "Authorization": f"Bearer {self._key()}",
            "Accept": "application/json",
        }
        encoded = None
        if body is not None:
            encoded = json.dumps(body, separators=(",", ":")).encode()
            headers["Content-Type"] = "application/json"
        return urllib.request.Request(
            f"{self.base_url}{path}", data=encoded, headers=headers,
            method=method)

    def _json(
        self, path: str, *, method: str = "GET",
        body: dict[str, Any] | None = None, timeout: int = 30,
    ) -> dict[str, Any]:
        try:
            with self.opener(
                self._request(path, method=method, body=body), timeout=timeout,
            ) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code in {401, 403}:
                raise MediaGenerationProviderSetupError(
                    "KIE rejected the saved API key.") from exc
            if exc.code == 429:
                raise MediaGenerationProviderError(
                    "KIE is rate-limiting requests. Wait, then retry.") from exc
            if exc.code == 400:
                raise MediaGenerationProviderError(
                    "KIE rejected these model settings.") from exc
            raise MediaGenerationProviderError(
                f"KIE failed ({exc.code}). Try again.") from exc
        except (OSError, TimeoutError, json.JSONDecodeError) as exc:
            raise MediaGenerationProviderError(
                "KIE is unavailable. Try again.") from exc
        if not isinstance(payload, dict):
            raise MediaGenerationProviderError("KIE returned an invalid response.")
        code = payload.get("code")
        if code not in (None, 0, 200):
            raise MediaGenerationProviderError(
                str(payload.get("msg") or "KIE rejected the request."))
        return payload

    def status(self) -> dict[str, Any]:
        if not self.configured():
            return {"configured": False, "connected": False,
                    "reason": "Add the KIE API key in Settings."}
        try:
            payload = self._json("/api/v1/chat/credit", timeout=10)
        except MediaGenerationProviderError as exc:
            return {"configured": True, "connected": False,
                    "reason": str(exc)}
        data = payload.get("data")
        credits = data.get("credits") if isinstance(data, dict) else data
        return {"configured": True, "connected": True,
                "reason": "", "credits": credits}

    def submit(
        self, request: dict[str, Any], *, callback_reference: str | None = None,
    ) -> MediaGenerationSubmission:
        callback_url = ((os.getenv("KIE_CALLBACK_URL") or "").strip()
                        if self.callback_configured() else "")
        if callback_url:
            if callback_reference:
                separator = "&" if "?" in callback_url else "?"
                callback_token = hmac.new(
                    (os.getenv("KIE_WEBHOOK_HMAC_KEY") or "").encode(),
                    callback_reference.encode(), hashlib.sha256,
                ).hexdigest()
                callback_url = (
                    f"{callback_url}{separator}attempt_id="
                    f"{urllib.parse.quote(callback_reference)}"
                    f"&token={callback_token}")
            request = {**request, "callBackUrl": callback_url}
        payload = self._json(
            "/api/v1/jobs/createTask", method="POST", body=request,
            timeout=45)
        data = payload.get("data") or {}
        task_id = data.get("taskId") if isinstance(data, dict) else None
        if not task_id:
            raise MediaGenerationProviderError("KIE did not return a valid task ID.")
        return MediaGenerationSubmission(str(task_id))

    @staticmethod
    def accounting(
        state: MediaGenerationProviderState,
    ) -> tuple[float, dict[str, Any]]:
        raw = state.raw or {}
        credits = raw.get("creditsConsumed")
        try:
            credits_value = max(0.0, float(credits))
        except (TypeError, ValueError):
            if state.state == "failed":
                return 0.0, {
                    "credits_consumed": 0.0,
                    "credit_usd": KIE_CREDIT_USD,
                    "basis": "kie_failed_task_no_charge",
                }
            return 0.0, {}
        return round(credits_value * KIE_CREDIT_USD, 6), {
            "credits_consumed": credits_value,
            "credit_usd": KIE_CREDIT_USD,
            "basis": "provider_reported_credits",
        }

    @staticmethod
    def _result_urls(result: Any) -> tuple[str, ...]:
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except json.JSONDecodeError:
                return (result,) if result.startswith("http") else ()
        if isinstance(result, list):
            return tuple(str(item) for item in result
                         if str(item).startswith("http"))
        if not isinstance(result, dict):
            return ()
        for key in ("resultUrls", "result_urls", "urls", "outputUrls",
                    "output_urls"):
            value = result.get(key)
            if isinstance(value, list):
                return tuple(str(item) for item in value
                             if str(item).startswith("http"))
        for key in ("resultUrl", "result_url", "url", "outputUrl",
                    "output_url"):
            value = result.get(key)
            if isinstance(value, str) and value.startswith("http"):
                return (value,)
        return ()

    @classmethod
    def _state(cls, data: Any) -> MediaGenerationProviderState:
        if not isinstance(data, dict):
            raise MediaGenerationProviderError("KIE returned an invalid task state.")
        state = str(data.get("state") or "").casefold()
        if state in {"waiting", "queuing"}:
            normalized = "queued"
        elif state == "generating":
            normalized = "running"
        elif state == "success":
            normalized = "succeeded"
        elif state == "fail":
            normalized = "failed"
        else:
            raise MediaGenerationProviderError("KIE returned an unknown task state.")
        raw_progress = data.get("progress")
        try:
            task_progress = max(0, min(100, int(float(raw_progress))))
        except (TypeError, ValueError):
            task_progress = None
        return MediaGenerationProviderState(
            normalized,
            progress=task_progress,
            output_urls=cls._result_urls(data.get("resultJson")),
            error=str(data.get("failMsg") or data.get("errorMessage") or ""),
            raw=data,
        )

    def task(self, provider_job_id: str) -> MediaGenerationProviderState:
        query = urllib.parse.urlencode({"taskId": provider_job_id})
        payload = self._json(f"/api/v1/jobs/recordInfo?{query}")
        return self._state(payload.get("data") or {})

    def state_from_callback(
        self, payload: dict[str, Any],
    ) -> MediaGenerationProviderState:
        data = payload.get("data") if isinstance(payload, dict) else None
        return self._state(data or payload)

    def download(self, url: str, target: Path) -> int:
        # KIE result hosts reject Python's default urllib user agent even when
        # the same temporary result URL is valid. Identify the server-side
        # downloader explicitly; provider URLs still never become canonical.
        request = urllib.request.Request(url, headers={
            "Accept": "*/*",
            "User-Agent": DOWNLOAD_USER_AGENT,
        })
        temporary = target.with_suffix(target.suffix + ".partial")
        temporary.unlink(missing_ok=True)
        try:
            with self.opener(request, timeout=300) as response:
                declared = int(response.headers.get("Content-Length") or 0)
                if declared > MAX_OUTPUT_BYTES:
                    raise MediaGenerationProviderError(
                        "The generated result is over the 1 GB limit.")
                size = 0
                with temporary.open("wb") as handle:
                    while chunk := response.read(1024 * 1024):
                        size += len(chunk)
                        if size > MAX_OUTPUT_BYTES:
                            raise MediaGenerationProviderError(
                                "The generated result is over the 1 GB limit.")
                        handle.write(chunk)
            if size <= 0:
                raise MediaGenerationProviderError("KIE returned an empty result.")
            temporary.replace(target)
            return size
        except MediaGenerationProviderError:
            temporary.unlink(missing_ok=True)
            target.unlink(missing_ok=True)
            raise
        except (OSError, TimeoutError, urllib.error.URLError) as exc:
            temporary.unlink(missing_ok=True)
            target.unlink(missing_ok=True)
            raise MediaGenerationProviderError(
                "The KIE result could not be saved. Retry saving it without "
                "paying for another generation.") from exc

    def cancel(self, provider_job_id: str) -> None:
        # KIE's common Market task API does not expose a generic cancel route.
        return
