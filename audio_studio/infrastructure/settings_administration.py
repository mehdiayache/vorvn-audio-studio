"""Filesystem, environment and S3 implementation of Settings ports."""

from __future__ import annotations

import os
from pathlib import Path
from threading import RLock
import time
from typing import Any, Callable

from audio_studio.config import alibaba_environment, settings
from audio_studio.infrastructure import object_storage, runtime_environment
from audio_studio.infrastructure.media_paths import media_root, voice_reference_root
from audio_studio.providers.freesound import (
    FreesoundCatalog,
    FreesoundOAuthTokens,
    freesound_status,
)


_STORAGE_ENV = {
    "endpoint": "RUSTFS_ENDPOINT", "access_key": "RUSTFS_ACCESS_KEY",
    "secret_key": "RUSTFS_SECRET_KEY", "bucket": "RUSTFS_BUCKET",
    "prefix": "RUSTFS_PREFIX", "region": "RUSTFS_REGION",
}
_ENVIRONMENT_WRITE_LOCK = RLock()


class EnvironmentSettings:
    def __init__(self, env_file: Path | None = None,
                 revision_file: Path | None = None,
                 reload_environment: Callable[[], None] =
                 runtime_environment.reload_owned_environment,
                 freesound_exchange: Callable[..., FreesoundOAuthTokens]
                 | None = None):
        self.env_file = env_file or settings.root / ".env"
        self.revision_file = revision_file or runtime_environment.REVISION_FILE
        self.reload_environment = reload_environment
        self.freesound_exchange = (
            freesound_exchange
            or FreesoundCatalog().exchange_authorization_code)

    def _write_environment(self, changes: dict[str, str | None]) -> None:
        """Atomically update owned keys while preserving unrelated settings."""
        with _ENVIRONMENT_WRITE_LOCK:
            for key, value in changes.items():
                if "\n" in key or "\r" in key or (value is not None and (
                        "\n" in value or "\r" in value)):
                    raise ValueError("Settings values cannot contain line breaks.")
            lines = (self.env_file.read_text().splitlines()
                     if self.env_file.exists() else [])
            owned = set(changes)
            kept = [
                line for line in lines
                if not any(line.startswith(f"{key}=") for key in owned)
            ]
            for key, value in changes.items():
                if value is not None:
                    kept.append(f"{key}={value}")
                    os.environ[key] = value
                else:
                    os.environ.pop(key, None)
            temporary = self.env_file.with_suffix(".env.tmp")
            temporary.write_text("\n".join(kept).rstrip() + "\n")
            temporary.chmod(0o600)
            temporary.replace(self.env_file)
            revision = self.revision_file.with_suffix(".tmp")
            revision.write_text(str(time.time_ns()))
            revision.replace(self.revision_file)
        self.reload_environment()

    def provider(self) -> dict[str, Any]:
        environment = alibaba_environment()
        return {
            "name": "Alibaba Model Studio",
            "configured": environment.api_key_configured,
            "workspace_configured": bool(environment.workspace_id),
            "workspace_id": environment.workspace_id,
            "region": environment.region,
            "region_label": environment.region_label,
            "http_base": environment.native_http_base,
        }

    def director_provider(self) -> dict[str, Any]:
        configured = bool((os.getenv("KIE_API_KEY") or "").strip())
        return {
            "name": "KIE",
            "configured": configured,
            "callback_configured": bool(
                (os.getenv("KIE_CALLBACK_URL") or "").strip()
                and (os.getenv("KIE_WEBHOOK_HMAC_KEY") or "").strip()),
            "base_url": (os.getenv("KIE_API_BASE_URL")
                         or "https://api.kie.ai").rstrip("/"),
            "reason": "" if configured else (
                "Add the KIE API key before using KIE Director models."),
        }

    def storage(self) -> dict[str, str]:
        return object_storage.settings()

    def audio_catalog(self) -> dict[str, Any]:
        return {
            "provider": "Freesound",
            **freesound_status(),
        }

    def audio_generation(self) -> dict[str, Any]:
        configured = bool((os.getenv("VORVN_AI_API_KEY") or "").strip())
        return {
            "provider": "VORVN Audio",
            "base_url": (os.getenv("VORVN_AI_BASE_URL")
                         or "https://ai.vrn.one").rstrip("/"),
            "configured": configured,
            "reason": "" if configured else (
                "Add the Audio Generation key before generating."),
        }

    def storage_configured(self) -> bool:
        return object_storage.configured()

    def test_storage(self) -> dict[str, Any]:
        return object_storage.status()

    def save_provider(self, values: dict[str, Any]) -> None:
        changes: dict[str, str | None] = {
            "DASHSCOPE_REGION": str(values["region"]),
            "DASHSCOPE_WORKSPACE_ID": str(values.get("workspace_id") or ""),
        }
        api_key = str(values.get("api_key") or "").strip()
        if api_key:
            changes["DASHSCOPE_API_KEY"] = api_key
        self._write_environment(changes)

    def save_director_provider(self, values: dict[str, Any]) -> None:
        changes: dict[str, str | None] = {}
        api_key = str(values.get("api_key") or "").strip()
        base_url = str(values.get("base_url") or "").strip().rstrip("/")
        if api_key:
            changes["KIE_API_KEY"] = api_key
        if base_url:
            if not base_url.startswith("https://"):
                raise ValueError("KIE must use an HTTPS endpoint.")
            changes["KIE_API_BASE_URL"] = base_url
        if changes:
            self._write_environment(changes)

    def save_audio_catalog(self, values: dict[str, Any]) -> None:
        changes: dict[str, str | None] = {}
        api_token = str(values.get("api_token") or "").strip()
        client_id = str(values.get("client_id") or "").strip()
        authorization_code = str(
            values.get("authorization_code") or "").strip()
        if api_token:
            changes["FREESOUND_API_TOKEN"] = api_token
        if client_id:
            changes["FREESOUND_CLIENT_ID"] = client_id
        if (api_token or client_id) and not authorization_code:
            # OAuth tokens belong to one exact application/user pair. A new
            # credential must be authorized instead of inheriting an old pair.
            changes.update({
                "FREESOUND_OAUTH_ACCESS_TOKEN": None,
                "FREESOUND_OAUTH_REFRESH_TOKEN": None,
                "FREESOUND_OAUTH_EXPIRES_AT": None,
            })
        if authorization_code:
            resolved_client_id = client_id or (
                os.getenv("FREESOUND_CLIENT_ID") or "").strip()
            resolved_secret = api_token or (
                os.getenv("FREESOUND_API_TOKEN") or "").strip()
            if not resolved_client_id or not resolved_secret:
                raise ValueError(
                    "Save the Freesound Client ID and API token before "
                    "finishing authorization.")
            tokens = self.freesound_exchange(
                client_id=resolved_client_id,
                client_secret=resolved_secret,
                authorization_code=authorization_code,
            )
            changes.update({
                "FREESOUND_OAUTH_ACCESS_TOKEN": tokens.access_token,
                "FREESOUND_OAUTH_REFRESH_TOKEN": tokens.refresh_token,
                "FREESOUND_OAUTH_EXPIRES_AT": str(tokens.expires_at),
            })
        if changes:
            self._write_environment(changes)

    def save_freesound_tokens(self, tokens: FreesoundOAuthTokens) -> None:
        """Persist a refreshed token pair so Keep survives process restarts."""
        self._write_environment({
            "FREESOUND_OAUTH_ACCESS_TOKEN": tokens.access_token,
            "FREESOUND_OAUTH_REFRESH_TOKEN": tokens.refresh_token,
            "FREESOUND_OAUTH_EXPIRES_AT": str(tokens.expires_at),
        })

    def save_audio_generation(self, values: dict[str, Any]) -> None:
        changes: dict[str, str | None] = {}
        api_key = str(values.get("api_key") or "").strip()
        base_url = str(values.get("base_url") or "").strip().rstrip("/")
        if api_key:
            changes["VORVN_AI_API_KEY"] = api_key
        if base_url:
            if not base_url.startswith("https://"):
                raise ValueError("Audio Generation must use an HTTPS endpoint.")
            changes["VORVN_AI_BASE_URL"] = base_url
        if changes:
            self._write_environment(changes)

    def save_storage(self, values: dict[str, Any]) -> None:
        current = self.storage()
        changes: dict[str, str | None] = {}
        for field, environment_key in _STORAGE_ENV.items():
            supplied = str(values.get(field) or "").strip()
            if field in {"access_key", "secret_key"} and not supplied:
                continue
            changes[environment_key] = (
                supplied if field in values else str(current.get(field) or ""))
        self._write_environment(changes)

    def output_directory(self) -> str:
        return str(media_root())


class FilesystemMaintenance:
    def __init__(self, root: Path = settings.root,
                 output: Callable[[], Path] = media_root,
                 voice_references: Callable[[], Path] = voice_reference_root):
        self.root = root
        self.output = output
        self.voice_references = voice_references

    @staticmethod
    def _measure(path: Path) -> tuple[int, int]:
        files = ([item for item in path.rglob("*") if item.is_file()]
                 if path.exists() else [])
        return sum(item.stat().st_size for item in files), len(files)

    def snapshot(self) -> dict[str, Any]:
        scratch_paths = {
            ".blocks": (self.root / ".blocks", "per-block script audio"),
            ".inbox": (self.root / ".inbox", "subtitle source audio"),
            ".incoming": (
                self.root / ".incoming",
                "temporary uploads and generated audio candidates"),
            ".tagged": (self.root / ".tagged", "temporary tagged copies"),
        }
        protected_paths = {
            ".uploads": (
                self.root / ".uploads", "protected legacy voice masters"),
            "voice-references": (
                self.voice_references(), "durable voice masters"),
        }
        finished_bytes, finished_files = self._measure(self.output())
        scratch = {}
        for name, (path, description) in scratch_paths.items():
            size, count = self._measure(path)
            scratch[name] = {"bytes": size, "files": count,
                             "what": description}
        protected = {}
        for name, (path, description) in protected_paths.items():
            size, count = self._measure(path)
            protected[name] = {"bytes": size, "files": count,
                               "what": description}
        return {
            "finished": {"bytes": finished_bytes, "files": finished_files,
                         "where": str(self.output())},
            "scratch": scratch, "protected": protected,
            "protected_total": sum(item["bytes"] for item in protected.values()),
            "scratch_total": sum(item["bytes"] for item in scratch.values()),
            "keep_days": 7,
        }

    def tidy(self, days: int = 7) -> dict[str, int]:
        if days < 0:
            raise ValueError("Retention days cannot be negative.")
        cutoff = time.time() - days * 86400
        removed = freed = 0
        for folder in (".blocks", ".inbox", ".incoming", ".tagged"):
            root = self.root / folder
            if not root.exists():
                continue
            for item in root.rglob("*"):
                if item.is_file() and item.stat().st_mtime < cutoff:
                    freed += item.stat().st_size
                    item.unlink(missing_ok=True)
                    removed += 1
        return {"removed": removed, "freed": freed}
