"""Explicit machine-administration operations for the native Settings API."""

from __future__ import annotations

import os
import time
from pathlib import Path
from threading import RLock
from typing import Any

import db
import say
import storage

from audio_studio.config import settings
from audio_studio.application.preferences import load_preferences


ENV_FILE = settings.root / ".env"
_lock = RLock()
_STORAGE_ENV = {
    "endpoint": "RUSTFS_ENDPOINT", "access_key": "RUSTFS_ACCESS_KEY",
    "secret_key": "RUSTFS_SECRET_KEY", "bucket": "RUSTFS_BUCKET",
    "prefix": "RUSTFS_PREFIX", "region": "RUSTFS_REGION",
    "public_url": "RUSTFS_PUBLIC_URL",
}


def _write_environment(changes: dict[str, str | None]) -> None:
    """Atomically update only owned keys while preserving unrelated settings."""
    with _lock:
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
    output = Path(load_preferences()["out_dir"]).expanduser()
    scratch_paths = {
        ".batches": (settings.root / ".batches", "parsed spreadsheets"),
        ".uploads": (settings.root / ".uploads", "reference recordings"),
        ".blocks": (settings.root / ".blocks", "per-block script audio"),
        ".inbox": (settings.root / ".inbox", "subtitle source audio"),
        ".tagged": (settings.root / ".tagged", "temporary tagged copies"),
    }
    def measure(path: Path) -> tuple[int, int]:
        files = [item for item in path.rglob("*") if item.is_file()] if path.exists() else []
        return sum(item.stat().st_size for item in files), len(files)
    finished_bytes, finished_files = measure(output)
    scratch = {}
    for name, (path, description) in scratch_paths.items():
        size, count = measure(path)
        scratch[name] = {"bytes": size, "files": count, "what": description}
    return {"finished": {"bytes": finished_bytes, "files": finished_files,
                          "where": str(output)}, "scratch": scratch,
            "scratch_total": sum(item["bytes"] for item in scratch.values()),
            "keep_days": 7}


def tidy_working_files(days: int = 7) -> dict[str, int]:
    if days < 0:
        raise ValueError("Retention days cannot be negative.")
    cutoff = time.time() - days * 86400
    removed = freed = 0
    for folder in (".batches", ".uploads", ".blocks", ".inbox", ".tagged"):
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
    return db.pronunciations()


def save_pronunciation(values: dict[str, Any]) -> int:
    pattern = str(values.get("pattern") or "").strip()
    replacement = str(values.get("replacement") or "").strip()
    if not pattern or not replacement:
        raise ValueError("Both the written form and pronunciation are required.")
    return int(db.pronunciation_save({
        "id": values.get("id"), "pattern": pattern, "replacement": replacement,
        "whole_word": bool(values.get("whole_word", True)),
        "match_case": bool(values.get("match_case", False)),
        "enabled": bool(values.get("enabled", True)),
        "phoneme": bool(values.get("phoneme", False)),
    }))
