"""Alibaba Singapore authentication and asynchronous task lifecycle.

Model adapters supply the exact service path and request body. This adapter
owns only regional transport and task state normalization.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
import urllib.error
import urllib.request

from audio_studio.config import alibaba_environment
from audio_studio.providers.director import (
    DirectorProviderError, DirectorProviderSetupError,
    DirectorProviderState, DirectorSubmission,
)


MAX_OUTPUT_BYTES = 1_000_000_000


class AlibabaSingaporeDirectorProvider:
    provider_id = "alibaba_sg"

    def __init__(self, *, opener=urllib.request.urlopen):
        self.opener = opener

    @staticmethod
    def configured() -> bool:
        environment = alibaba_environment()
        return (environment.region == "intl"
                and environment.api_key_configured)

    @staticmethod
    def callback_configured() -> bool:
        # No Director callback is registered until a concrete Wan adapter has
        # an exact, documented callback contract for the Singapore endpoint.
        return False

    @staticmethod
    def estimate_cost(request: dict[str, Any]) -> float:
        del request
        raise DirectorProviderError(
            "Alibaba pricing is not configured for this Director model.")

    @staticmethod
    def _key() -> str:
        environment = alibaba_environment()
        key = (os.getenv("DASHSCOPE_API_KEY") or "").strip()
        if environment.region != "intl":
            raise DirectorProviderSetupError(
                "Choose Singapore in Settings for Alibaba Director models.")
        if not key:
            raise DirectorProviderSetupError(
                "Add the Alibaba Singapore API key in Settings.")
        return key

    def _json(
        self, url: str, *, method: str = "GET",
        body: dict[str, Any] | None = None, timeout: int = 60,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {self._key()}",
            "Accept": "application/json",
        }
        encoded = None
        if body is not None:
            encoded = json.dumps(body, separators=(",", ":")).encode()
            headers["Content-Type"] = "application/json"
            headers["X-DashScope-Async"] = "enable"
        request = urllib.request.Request(
            url, data=encoded, headers=headers, method=method)
        try:
            with self.opener(request, timeout=timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code in {401, 403}:
                raise DirectorProviderSetupError(
                    "Alibaba rejected the saved Singapore connection.") from exc
            if exc.code == 429:
                raise DirectorProviderError(
                    "Alibaba is rate-limiting requests. Wait, then retry.") from exc
            raise DirectorProviderError(
                f"Alibaba generation failed ({exc.code}).") from exc
        except (OSError, TimeoutError, json.JSONDecodeError) as exc:
            raise DirectorProviderError(
                "Alibaba generation is unavailable. Try again.") from exc
        if not isinstance(payload, dict):
            raise DirectorProviderError(
                "Alibaba returned an invalid response.")
        if payload.get("code") and not payload.get("output"):
            raise DirectorProviderError(
                str(payload.get("message") or "Alibaba rejected the request."))
        return payload

    def status(self) -> dict[str, Any]:
        environment = alibaba_environment()
        return {
            "configured": self.configured(),
            "connected": self.configured(),
            "region": environment.region,
            "region_label": environment.region_label,
            "workspace_configured": bool(environment.workspace_id),
            "reason": "" if self.configured() else (
                "Save an Alibaba Singapore API key before generating."),
        }

    def submit(
        self, request: dict[str, Any], *, callback_reference: str | None = None,
    ) -> DirectorSubmission:
        del callback_reference
        path = str(request.get("path") or "").strip()
        body = request.get("body")
        if not path.startswith("/") or not isinstance(body, dict):
            raise DirectorProviderError(
                "The Alibaba model adapter produced an invalid request.")
        base = alibaba_environment().native_http_base.rstrip("/")
        payload = self._json(f"{base}{path}", method="POST", body=body)
        output = payload.get("output") or {}
        task_id = output.get("task_id") if isinstance(output, dict) else None
        if not task_id:
            raise DirectorProviderError(
                "Alibaba did not return a valid task ID.")
        return DirectorSubmission(str(task_id))

    @staticmethod
    def _state(payload: dict[str, Any]) -> DirectorProviderState:
        output = payload.get("output") or {}
        status = str(output.get("task_status") or "").upper()
        if status in {"PENDING", "UNKNOWN"}:
            normalized = "queued"
        elif status == "RUNNING":
            normalized = "running"
        elif status == "SUCCEEDED":
            normalized = "succeeded"
        elif status in {"FAILED", "CANCELED"}:
            normalized = "failed"
        else:
            raise DirectorProviderError(
                "Alibaba returned an unknown task state.")
        urls: list[str] = []
        for result in output.get("results") or []:
            if not isinstance(result, dict):
                continue
            for key in ("url", "video_url", "image_url"):
                value = result.get(key)
                if isinstance(value, str) and value.startswith("http"):
                    urls.append(value)
        return DirectorProviderState(
            normalized, tuple(urls),
            error=str(output.get("message") or payload.get("message") or ""),
            raw=payload,
        )

    def task(self, provider_job_id: str) -> DirectorProviderState:
        base = alibaba_environment().native_http_base.rstrip("/")
        payload = self._json(f"{base}/tasks/{provider_job_id}")
        return self._state(payload)

    def state_from_callback(
        self, payload: dict[str, Any],
    ) -> DirectorProviderState:
        return self._state(payload)

    @staticmethod
    def accounting(
        state: DirectorProviderState,
    ) -> tuple[float, dict[str, Any]]:
        del state
        # Kept deliberately unknown until a concrete Wan model exposes an
        # audited usage contract. estimate_cost() prevents paid wiring first.
        return 0.0, {}

    def download(self, url: str, target: Path) -> int:
        request = urllib.request.Request(url, headers={"Accept": "*/*"})
        temporary = target.with_suffix(target.suffix + ".partial")
        temporary.unlink(missing_ok=True)
        try:
            with self.opener(request, timeout=300) as response:
                size = 0
                with temporary.open("wb") as handle:
                    while chunk := response.read(1024 * 1024):
                        size += len(chunk)
                        if size > MAX_OUTPUT_BYTES:
                            raise DirectorProviderError(
                                "The generated result is over the 1 GB limit.")
                        handle.write(chunk)
            if size <= 0:
                raise DirectorProviderError(
                    "Alibaba returned an empty result.")
            temporary.replace(target)
            return size
        except DirectorProviderError:
            temporary.unlink(missing_ok=True)
            target.unlink(missing_ok=True)
            raise
        except (OSError, TimeoutError, urllib.error.URLError) as exc:
            temporary.unlink(missing_ok=True)
            target.unlink(missing_ok=True)
            raise DirectorProviderError(
                "The Alibaba result could not be downloaded. Retry the generation.") from exc

    def cancel(self, provider_job_id: str) -> None:
        base = alibaba_environment().native_http_base.rstrip("/")
        try:
            self._json(
                f"{base}/tasks/{provider_job_id}", method="DELETE")
        except DirectorProviderError:
            return
