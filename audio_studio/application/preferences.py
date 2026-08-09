"""Durable local preferences shared by HTTP, workers, and provider adapters."""

from __future__ import annotations

import json
from pathlib import Path
from threading import RLock
from typing import Any

from audio_studio.config import settings


PREFERENCES_FILE = settings.root / ".prefs.json"
DEFAULT_PREFERENCES: dict[str, Any] = {
    "out_dir": str(settings.output_dir),
    "warn_above": 1.0,
    "daily_cap": 0.0,
    "synth_flags": {"enable_tn": True},
    "extra_params": "",
    "fix_dates_phones": True,
    "day_first": True,
}
_lock = RLock()


def load_preferences() -> dict[str, Any]:
    """Return validated JSON preferences over immutable application defaults."""
    result = dict(DEFAULT_PREFERENCES)
    if not PREFERENCES_FILE.exists():
        return result
    try:
        stored = json.loads(PREFERENCES_FILE.read_text())
    except (OSError, json.JSONDecodeError):
        return result
    if isinstance(stored, dict):
        result.update(stored)
    # Media location is deployment configuration, never a mutable preference:
    # changing a lookup root without moving the database and files would make
    # every historical recording disappear.
    result["out_dir"] = str(settings.output_dir)
    return result


def save_preferences(values: dict[str, Any]) -> dict[str, Any]:
    """Atomically replace the preference document and return the saved value."""
    merged = {**DEFAULT_PREFERENCES, **values, "out_dir": str(settings.output_dir)}
    payload = json.dumps(merged, indent=2, ensure_ascii=False) + "\n"
    temporary = PREFERENCES_FILE.with_suffix(".json.tmp")
    with _lock:
        temporary.write_text(payload)
        temporary.chmod(0o600)
        temporary.replace(PREFERENCES_FILE)
    return merged
