"""Application settings use cases, independent from the HTTP transport."""

from __future__ import annotations

import json
import os
from typing import Any

import naming
import say
from audio_studio.infrastructure import object_storage as storage
from services.alibaba import config as alibaba_config

from audio_studio.application.preferences import load_preferences, save_preferences
from audio_studio.infrastructure.postgres.control_plane import (
    ControlPlaneRepository,
)
from audio_studio.infrastructure.media_paths import media_root


repository = ControlPlaneRepository()


def snapshot() -> dict[str, Any]:
    preferences = load_preferences()
    storage_values = storage.settings()
    return {
        "provider": {
            "name": "Alibaba Model Studio",
            "configured": bool(os.getenv("DASHSCOPE_API_KEY")),
            "workspace_configured": bool(alibaba_config.workspace_id()),
            "workspace_id": alibaba_config.workspace_id(),
            "region": alibaba_config.region(),
            "region_label": "Beijing" if alibaba_config.region() == "beijing" else "Singapore",
            "http_base": alibaba_config.http_base(),
        },
        "output_directory": str(media_root()),
        "spending": {
            "warn_above": float(preferences.get("warn_above") or 0),
            "daily_cap": float(preferences.get("daily_cap") or 0),
            **repository.spend_totals(),
        },
        "speech": {
            "fix_dates_phones": bool(preferences.get("fix_dates_phones", True)),
            "day_first": bool(preferences.get("day_first", True)),
            "synth_flags": {key: bool(value) for key, value in (preferences.get("synth_flags") or {}).items() if key in say.SYNTH_FLAGS},
            "supported_flags": say.SYNTH_FLAGS,
            "extra_params": str(preferences.get("extra_params") or ""),
        },
        "naming": naming.merged(
            repository.setting("naming", preferences.get("naming", {})), None),
        "naming_tokens": list(naming.TOKENS),
        "database": repository.database_status(),
        # Loading Settings must never wait on a remote bucket. Reachability is
        # checked only by the explicit Test connection action.
        "storage": ({"configured": True, "status": "Configured",
                     "bucket": storage_values["bucket"],
                     "endpoint": storage_values["endpoint"]}
                    if storage.configured() else
                    {"configured": False, "status": "Needs setup",
                     "reason": "Not set up yet."}),
        "storage_settings": {
            **{key: value for key, value in storage_values.items()
               if key not in {"access_key", "secret_key"}},
            "access_key_configured": bool(storage_values.get("access_key")),
            "secret_key_configured": bool(storage_values.get("secret_key")),
        },
    }


def update(changes: dict[str, Any]) -> dict[str, Any]:
    preferences = load_preferences()
    if "output_directory" in changes:
        raise ValueError(
            "The media folder is deployment configuration. Set "
            "AUDIO_STUDIO_OUTPUT_DIR before starting Audio Studio."
        )
    if "warn_above" in changes:
        preferences["warn_above"] = _non_negative(changes["warn_above"], "Warning threshold")
    if "daily_cap" in changes:
        preferences["daily_cap"] = _non_negative(changes["daily_cap"], "Daily cap")
    for key in ("fix_dates_phones", "day_first"):
        if key in changes:
            preferences[key] = bool(changes[key])
    if "extra_params" in changes:
        raw = str(changes["extra_params"] or "").strip()
        if raw:
            parsed = json.loads(raw)
            if not isinstance(parsed, dict):
                raise ValueError("Extra parameters must be a JSON object.")
        preferences["extra_params"] = raw
    if "synth_flags" in changes:
        preferences["synth_flags"] = {
            key: bool(value) for key, value in (changes["synth_flags"] or {}).items()
            if key in say.SYNTH_FLAGS
        }
    if "naming" in changes:
        value = changes["naming"]
        repository.save_setting("naming", None if value is None else {
            key: item for key, item in value.items() if key in naming.DEFAULTS
        })
    save_preferences(preferences)
    return snapshot()


def _non_negative(value: Any, label: str) -> float:
    try:
        number = float(value or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must be a number.") from exc
    if number < 0:
        raise ValueError(f"{label} cannot be negative.")
    return number
