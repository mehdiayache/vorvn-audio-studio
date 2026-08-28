"""KIE authentication and unified task lifecycle."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
import urllib.error
import urllib.parse
import urllib.request

from audio_studio.providers.director import (
    DirectorProviderError, DirectorProviderSetupError,
    DirectorProviderState, DirectorSubmission,
)


DEFAULT_BASE_URL = "https://api.kie.ai"
MAX_OUTPUT_BYTES = 1_000_000_000
DOWNLOAD_USER_AGENT = "Auvi-Studio/1.0"


class KieDirectorProvider:
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
    def _key() -> str:
        key = (os.getenv("KIE_API_KEY") or "").strip()
        if not key:
            raise DirectorProviderSetupError(
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
                raise DirectorProviderSetupError(
                    "KIE rejected the saved API key.") from exc
            if exc.code == 429:
                raise DirectorProviderError(
                    "KIE is rate-limiting requests. Wait, then retry.") from exc
            if exc.code == 400:
                raise DirectorProviderError(
                    "KIE rejected these model settings.") from exc
            raise DirectorProviderError(
                f"KIE failed ({exc.code}). Try again.") from exc
        except (OSError, TimeoutError, json.JSONDecodeError) as exc:
            raise DirectorProviderError(
                "KIE is unavailable. Try again.") from exc
        if not isinstance(payload, dict):
            raise DirectorProviderError("KIE returned an invalid response.")
        code = payload.get("code")
        if code not in (None, 0, 200):
            raise DirectorProviderError(
                str(payload.get("msg") or "KIE rejected the request."))
        return payload

    def status(self) -> dict[str, Any]:
        if not self.configured():
            return {"configured": False, "connected": False,
                    "reason": "Add the KIE API key in Settings."}
        try:
            payload = self._json("/api/v1/chat/credit", timeout=10)
        except DirectorProviderError as exc:
            return {"configured": True, "connected": False,
                    "reason": str(exc)}
        data = payload.get("data")
        credits = data.get("credits") if isinstance(data, dict) else data
        return {"configured": True, "connected": True,
                "reason": "", "credits": credits}

    def submit(self, request: dict[str, Any]) -> DirectorSubmission:
        payload = self._json(
            "/api/v1/jobs/createTask", method="POST", body=request,
            timeout=45)
        data = payload.get("data") or {}
        task_id = data.get("taskId") if isinstance(data, dict) else None
        if not task_id:
            raise DirectorProviderError("KIE did not return a valid task ID.")
        return DirectorSubmission(str(task_id))

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

    def task(self, provider_job_id: str) -> DirectorProviderState:
        query = urllib.parse.urlencode({"taskId": provider_job_id})
        payload = self._json(f"/api/v1/jobs/recordInfo?{query}")
        data = payload.get("data") or {}
        if not isinstance(data, dict):
            raise DirectorProviderError("KIE returned an invalid task state.")
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
            raise DirectorProviderError("KIE returned an unknown task state.")
        return DirectorProviderState(
            normalized,
            output_urls=self._result_urls(data.get("resultJson")),
            error=str(data.get("failMsg") or data.get("errorMessage") or ""),
            raw=data,
        )

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
                    raise DirectorProviderError(
                        "The generated result is over the 1 GB limit.")
                size = 0
                with temporary.open("wb") as handle:
                    while chunk := response.read(1024 * 1024):
                        size += len(chunk)
                        if size > MAX_OUTPUT_BYTES:
                            raise DirectorProviderError(
                                "The generated result is over the 1 GB limit.")
                        handle.write(chunk)
            if size <= 0:
                raise DirectorProviderError("KIE returned an empty result.")
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
                "The KIE result could not be downloaded. Retry the generation.") from exc

    def cancel(self, provider_job_id: str) -> None:
        # KIE's common Market task API does not expose a generic cancel route.
        return
