"""Explicit machine-administration operations for the native Settings API."""

from __future__ import annotations

import os
import time
from pathlib import Path
from threading import RLock
from typing import Any

import say
from audio_studio.infrastructure import object_storage as storage

from audio_studio.config import settings
from audio_studio.infrastructure.media_paths import media_root, voice_reference_root
from audio_studio.infrastructure.runtime_environment import REVISION_FILE
from audio_studio.infrastructure.postgres.pronunciations import (
    PronunciationRepository,
)


ENV_FILE = settings.root / ".env"
_lock = RLock()
pronunciation_repository = PronunciationRepository()
_STORAGE_ENV = {
    "endpoint": "RUSTFS_ENDPOINT", "access_key": "RUSTFS_ACCESS_KEY",
    "secret_key": "RUSTFS_SECRET_KEY", "bucket": "RUSTFS_BUCKET",
    "prefix": "RUSTFS_PREFIX", "region": "RUSTFS_REGION",
    "public_url": "RUSTFS_PUBLIC_URL",
}


def _write_environment(changes: dict[str, str | None]) -> None:
    """Atomically update only owned keys while preserving unrelated settings."""
    with _lock:
        for key, value in changes.items():
            if "\n" in key or "\r" in key or (value is not None and (
                    "\n" in value or "\r" in value)):
                raise ValueError("Settings values cannot contain line breaks.")
        lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
        owned = set(changes)
        kept = [line for line in lines if not any(line.startswith(f"{key}=") for key in owned)]
        for key, value in changes.items():
            if value is not None:
                kept.append(f"{key}={value}")
                os.environ[key] = value
        temporary = ENV_FILE.with_suffix(".env.tmp")
        temporary.write_text("\n".join(kept).rstrip() + "\n")
        temporary.chmod(0o600)
        temporary.replace(ENV_FILE)
        revision = REVISION_FILE.with_suffix(".tmp")
        revision.write_text(str(time.time_ns()))
        revision.replace(REVISION_FILE)


def update_provider(values: dict[str, Any]) -> None:
    region = str(values.get("region") or os.getenv("DASHSCOPE_REGION") or "intl")
    if region not in {"intl", "beijing"}:
        raise ValueError("Region must be Singapore or Beijing.")
    workspace = str(values.get("workspace_id") or "").strip()
    changes: dict[str, str | None] = {
        "DASHSCOPE_REGION": region,
        "DASHSCOPE_WORKSPACE_ID": workspace,
    }
    api_key = str(values.get("api_key") or "").strip()
    if api_key:
        changes["DASHSCOPE_API_KEY"] = api_key
    _write_environment(changes)
    say.apply_credentials()


def update_storage(values: dict[str, Any]) -> None:
    current = storage.settings()
    changes: dict[str, str | None] = {}
    for field, env_key in _STORAGE_ENV.items():
        supplied = str(values.get(field) or "").strip()
        if field in {"access_key", "secret_key"} and not supplied:
            continue
        changes[env_key] = supplied if field in values else str(current.get(field) or "")
    _write_environment(changes)


def pronunciation_preview(text: str) -> dict[str, Any]:
    prepared, applied = say.apply_pronunciations(text)
    return {"text": prepared, "applied": applied}


def disk_snapshot() -> dict[str, Any]:
    output = media_root()
    scratch_paths = {
        ".batches": (settings.root / ".batches", "parsed spreadsheets"),
        ".blocks": (settings.root / ".blocks", "per-block script audio"),
        ".inbox": (settings.root / ".inbox", "subtitle source audio"),
        ".incoming": (settings.root / ".incoming", "interrupted uploads"),
        ".tagged": (settings.root / ".tagged", "temporary tagged copies"),
    }
    protected_paths = {
        ".uploads": (settings.root / ".uploads", "protected legacy voice masters"),
        "voice-references": (voice_reference_root(), "durable voice masters"),
    }
    def measure(path: Path) -> tuple[int, int]:
        files = [item for item in path.rglob("*") if item.is_file()] if path.exists() else []
        return sum(item.stat().st_size for item in files), len(files)
    finished_bytes, finished_files = measure(output)
    scratch = {}
    for name, (path, description) in scratch_paths.items():
        size, count = measure(path)
        scratch[name] = {"bytes": size, "files": count, "what": description}
    protected = {}
    for name, (path, description) in protected_paths.items():
        size, count = measure(path)
        protected[name] = {"bytes": size, "files": count, "what": description}
    return {"finished": {"bytes": finished_bytes, "files": finished_files,
                          "where": str(output)}, "scratch": scratch,
            "protected": protected,
            "protected_total": sum(item["bytes"] for item in protected.values()),
            "scratch_total": sum(item["bytes"] for item in scratch.values()),
            "keep_days": 7}


def tidy_working_files(days: int = 7) -> dict[str, int]:
    if days < 0:
        raise ValueError("Retention days cannot be negative.")
    cutoff = time.time() - days * 86400
    removed = freed = 0
    # Voice references are masters, not scratch. Legacy .uploads is also kept
    # until every pre-migration reference has been copied on access.
    for folder in (".batches", ".blocks", ".inbox", ".incoming", ".tagged"):
        root = settings.root / folder
        if not root.exists():
            continue
        for item in root.rglob("*"):
            if item.is_file() and item.stat().st_mtime < cutoff:
                freed += item.stat().st_size
                item.unlink(missing_ok=True)
                removed += 1
    return {"removed": removed, "freed": freed}


def pronunciations() -> list[dict[str, Any]]:
    return pronunciation_repository.list()


def save_pronunciation(values: dict[str, Any]) -> int:
    pattern = str(values.get("pattern") or "").strip()
    replacement = str(values.get("replacement") or "").strip()
    if not pattern or not replacement:
        raise ValueError("Both the written form and pronunciation are required.")
    saved = pronunciation_repository.save({
        "id": values.get("id"), "pattern": pattern, "replacement": replacement,
        "whole_word": bool(values.get("whole_word", True)),
        "match_case": bool(values.get("match_case", False)),
        "enabled": bool(values.get("enabled", True)),
        "phoneme": bool(values.get("phoneme", False)),
    })
    if saved is None:
        raise ValueError("That pronunciation rule no longer exists.")
    return saved


def delete_pronunciation(item_id: int) -> bool:
    return pronunciation_repository.delete(item_id)
