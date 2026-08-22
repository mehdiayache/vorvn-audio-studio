"""Backend-only adapter for VORVN's private Stable Audio service."""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
from typing import Any, Literal
import urllib.error
import urllib.request


AudioGenerationCapability = Literal["sfx", "music"]
DEFAULT_BASE_URL = "https://ai.vrn.one"
MAX_OUTPUT_BYTES = 250_000_000


class AudioGenerationError(RuntimeError):
    """An operator-safe failure from the private generation service."""


class AudioGenerationSetupError(AudioGenerationError):
    """The backend credential is missing or rejected."""


@dataclass(frozen=True, slots=True)
class GenerationSubmission:
    job_id: str
    seed: int


class OurStableAudioGenerator:
    """Exact adapter for ai.vrn.one; no Stable Audio cloud assumptions."""

    def __init__(self, *, base_url: str | None = None,
                 opener=urllib.request.urlopen):
        self.base_url = (base_url or os.getenv("VORVN_AI_BASE_URL")
                         or DEFAULT_BASE_URL).rstrip("/")
        self.opener = opener

    @staticmethod
    def configured() -> bool:
        return bool((os.getenv("VORVN_AI_API_KEY") or "").strip())

    @staticmethod
    def _key() -> str:
        key = (os.getenv("VORVN_AI_API_KEY") or "").strip()
        if not key:
            raise AudioGenerationSetupError(
                "Add the Audio Generation key in Settings before generating.")
        return key

    def _request(self, path: str, *, method: str = "GET",
                 body: dict[str, Any] | None = None,
                 idempotency_key: str | None = None) -> urllib.request.Request:
        headers = {
            "Authorization": f"Bearer {self._key()}",
            "Accept": "application/json",
        }
        encoded = None
        if body is not None:
            encoded = json.dumps(body, separators=(",", ":")).encode()
            headers["Content-Type"] = "application/json"
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        return urllib.request.Request(
            f"{self.base_url}{path}", data=encoded, headers=headers,
            method=method)

    def _json(self, path: str, *, method: str = "GET",
              body: dict[str, Any] | None = None,
              idempotency_key: str | None = None,
              timeout: int = 20) -> Any:
        request = self._request(
            path, method=method, body=body,
            idempotency_key=idempotency_key)
        try:
            with self.opener(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code in {401, 403}:
                raise AudioGenerationSetupError(
                    "The Audio Generation service rejected the saved key.") from exc
            if exc.code == 429:
                raise AudioGenerationError(
                    "Audio Generation is busy. Wait a moment, then retry.") from exc
            if exc.code == 400:
                raise AudioGenerationError(
                    "The generator rejected this request. Check the prompt and duration.") from exc
            raise AudioGenerationError(
                f"Audio Generation service failed ({exc.code}). Try again.") from exc
        except (OSError, TimeoutError, json.JSONDecodeError) as exc:
            raise AudioGenerationError(
                "Audio Generation service is unavailable. Try again.") from exc

    def status(self) -> dict[str, Any]:
        if not self.configured():
            return {
                "configured": False, "sfx_ready": False,
                "music_ready": False,
                "reason": "Add the Audio Generation key in Settings.",
                "models": {},
            }
        try:
            payload = self._json("/v1/models", timeout=8)
        except AudioGenerationError as exc:
            return {
                "configured": True, "sfx_ready": False,
                "music_ready": False, "reason": str(exc), "models": {},
            }
        models: dict[str, dict[str, Any]] = {}
        if isinstance(payload, list):
            for item in payload:
                if not isinstance(item, dict) or not item.get("available"):
                    continue
                purpose = str(item.get("purpose") or "")
                capability = "sfx" if purpose == "sound-effects" else (
                    "music" if purpose == "music" else "")
                if capability:
                    models[capability] = {
                        "id": str(item.get("id") or ""),
                        "max_seconds": int(item.get("max_seconds") or 0),
                        "output": str(item.get("output") or ""),
                    }
        return {
            "configured": True,
            "sfx_ready": "sfx" in models,
            "music_ready": "music" in models,
            "reason": "" if models else "No generation model is available.",
            "models": models,
        }

    def submit(self, capability: AudioGenerationCapability, *, prompt: str,
               seconds: int, seed: int | None,
               idempotency_key: str) -> GenerationSubmission:
        body: dict[str, Any] = {"prompt": prompt, "seconds": seconds}
        if seed is not None:
            body["seed"] = seed
        payload = self._json(
            f"/v1/audio/{capability}", method="POST", body=body,
            idempotency_key=idempotency_key, timeout=30)
        if not isinstance(payload, dict) or not payload.get("job_id"):
            raise AudioGenerationError(
                "Audio Generation did not return a valid Job.")
        try:
            resolved_seed = int(payload["seed"])
        except (KeyError, TypeError, ValueError) as exc:
            raise AudioGenerationError(
                "Audio Generation did not return the resolved seed.") from exc
        return GenerationSubmission(str(payload["job_id"]), resolved_seed)

    def job(self, provider_job_id: str) -> dict[str, Any]:
        payload = self._json(f"/v1/jobs/{provider_job_id}")
        if not isinstance(payload, dict) or not payload.get("status"):
            raise AudioGenerationError(
                "Audio Generation returned an invalid Job status.")
        return payload

    def cancel(self, provider_job_id: str) -> None:
        try:
            self._json(
                f"/v1/jobs/{provider_job_id}/cancel", method="POST", body={})
        except AudioGenerationError:
            # Local cancellation remains authoritative. The remote output is
            # temporary and will expire even if cancellation loses a race.
            return

    def download(self, provider_job_id: str, target: Path) -> int:
        request = self._request(f"/v1/jobs/{provider_job_id}/output")
        try:
            with self.opener(request, timeout=180) as response:
                length = int(response.headers.get("Content-Length") or 0)
                if length > MAX_OUTPUT_BYTES:
                    raise AudioGenerationError(
                        "The generated audio is over the 250 MB limit.")
                size = 0
                with target.open("wb") as handle:
                    while chunk := response.read(1024 * 1024):
                        size += len(chunk)
                        if size > MAX_OUTPUT_BYTES:
                            raise AudioGenerationError(
                                "The generated audio is over the 250 MB limit.")
                        handle.write(chunk)
        except urllib.error.HTTPError as exc:
            target.unlink(missing_ok=True)
            if exc.code in {401, 403}:
                raise AudioGenerationSetupError(
                    "The Audio Generation service rejected the saved key.") from exc
            if exc.code in {404, 410}:
                raise AudioGenerationError(
                    "That generated result expired before it was downloaded.") from exc
            raise AudioGenerationError(
                "The generated audio could not be downloaded. Try again.") from exc
        except (OSError, TimeoutError):
            target.unlink(missing_ok=True)
            raise AudioGenerationError(
                "The generated audio download did not finish. Try again.")
        if not target.is_file() or target.stat().st_size <= 0:
            target.unlink(missing_ok=True)
            raise AudioGenerationError(
                "Audio Generation returned an empty result.")
        return target.stat().st_size
