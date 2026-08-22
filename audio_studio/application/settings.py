"""Settings and machine-administration use cases behind explicit ports."""

from __future__ import annotations

import json
from typing import Any, Callable, Protocol

from audio_studio.domain import naming, speech_text


class ControlPlane(Protocol):
    def setting(self, key: str, fallback=None): ...
    def save_setting(self, key: str, value) -> bool: ...
    def spend_totals(self) -> dict: ...
    def database_status(self) -> dict: ...


class Configuration(Protocol):
    def provider(self) -> dict[str, Any]: ...
    def audio_catalog(self) -> dict[str, Any]: ...
    def audio_generation(self) -> dict[str, Any]: ...
    def storage(self) -> dict[str, str]: ...
    def storage_configured(self) -> bool: ...
    def test_storage(self) -> dict[str, Any]: ...
    def save_provider(self, values: dict[str, Any]) -> None: ...
    def save_audio_catalog(self, values: dict[str, Any]) -> None: ...
    def save_audio_generation(self, values: dict[str, Any]) -> None: ...
    def save_storage(self, values: dict[str, Any]) -> None: ...
    def output_directory(self) -> str: ...


class Maintenance(Protocol):
    def snapshot(self) -> dict[str, Any]: ...
    def tidy(self, days: int = 7) -> dict[str, int]: ...


class Pronunciations(Protocol):
    def list(self, *, enabled_only: bool = False) -> list[dict]: ...
    def save(self, entry: dict) -> int | None: ...
    def delete(self, entry_id: int) -> bool: ...


class SettingsService:
    def __init__(self, *, control_plane: ControlPlane,
                 configuration: Configuration, maintenance: Maintenance,
                 pronunciations: Pronunciations,
                 provider_connection_test: Callable[[], dict[str, Any]],
                 load_preferences: Callable[[], dict[str, Any]],
                 save_preferences: Callable[[dict[str, Any]], dict[str, Any]]):
        self.control_plane = control_plane
        self.configuration = configuration
        self.maintenance = maintenance
        self.pronunciation_repository = pronunciations
        self.provider_connection_test = provider_connection_test
        self.load_preferences = load_preferences
        self.save_preferences = save_preferences

    def snapshot(self) -> dict[str, Any]:
        preferences = self.load_preferences()
        storage_values = self.configuration.storage()
        return {
            "provider": self.configuration.provider(),
            "audio_catalog": self.configuration.audio_catalog(),
            "audio_generation": self.configuration.audio_generation(),
            "output_directory": self.configuration.output_directory(),
            "spending": {
                "warn_above": float(preferences.get("warn_above") or 0),
                "daily_cap": float(preferences.get("daily_cap") or 0),
                **self.control_plane.spend_totals(),
            },
            "speech": {
                "fix_dates_phones": bool(preferences.get("fix_dates_phones", True)),
                "day_first": bool(preferences.get("day_first", True)),
                "synth_flags": {
                    key: bool(value)
                    for key, value in (preferences.get("synth_flags") or {}).items()
                    if key in speech_text.SYNTH_FLAGS
                },
                "supported_flags": speech_text.SYNTH_FLAGS,
                "extra_params": str(preferences.get("extra_params") or ""),
            },
            "naming": naming.merged(
                self.control_plane.setting(
                    "naming", preferences.get("naming", {})), None),
            "naming_tokens": list(naming.TOKENS),
            "database": self.control_plane.database_status(),
            "storage": ({
                "configured": True, "status": "Configured",
                "bucket": storage_values["bucket"],
                "endpoint": storage_values["endpoint"],
            } if self.configuration.storage_configured() else {
                "configured": False, "status": "Needs setup",
                "reason": "Not set up yet.",
            }),
            "storage_settings": {
                **{
                    key: value for key, value in storage_values.items()
                    if key not in {"access_key", "secret_key"}
                },
                "access_key_configured": bool(storage_values.get("access_key")),
                "secret_key_configured": bool(storage_values.get("secret_key")),
            },
        }

    def update(self, changes: dict[str, Any]) -> dict[str, Any]:
        preferences = self.load_preferences()
        if "output_directory" in changes:
            raise ValueError(
                "The media folder is deployment configuration. Set "
                "AUDIO_STUDIO_OUTPUT_DIR before starting Audio Studio."
            )
        if "warn_above" in changes:
            preferences["warn_above"] = _non_negative(
                changes["warn_above"], "Warning threshold")
        if "daily_cap" in changes:
            preferences["daily_cap"] = _non_negative(
                changes["daily_cap"], "Daily cap")
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
                key: bool(value)
                for key, value in (changes["synth_flags"] or {}).items()
                if key in speech_text.SYNTH_FLAGS
            }
        if "naming" in changes:
            value = changes["naming"]
            self.control_plane.save_setting(
                "naming", None if value is None else {
                    key: item for key, item in value.items()
                    if key in naming.DEFAULTS
                })
        self.save_preferences(preferences)
        return self.snapshot()

    def update_provider(self, values: dict[str, Any]) -> dict[str, Any]:
        current = self.configuration.provider()
        region = str(values.get("region") or current.get("region") or "intl")
        if region not in {"intl", "beijing"}:
            raise ValueError("Region must be Singapore or Beijing.")
        self.configuration.save_provider({
            "region": region,
            "workspace_id": str(values.get("workspace_id") or "").strip(),
            "api_key": str(values.get("api_key") or "").strip(),
        })
        return self.snapshot()

    def update_storage(self, values: dict[str, Any]) -> dict[str, Any]:
        self.configuration.save_storage(values)
        return self.snapshot()

    def update_audio_catalog(self, values: dict[str, Any]) -> dict[str, Any]:
        self.configuration.save_audio_catalog({
            "api_token": str(values.get("api_token") or "").strip(),
            "oauth_access_token": str(
                values.get("oauth_access_token") or "").strip(),
        })
        return self.snapshot()

    def update_audio_generation(self, values: dict[str, Any]) -> dict[str, Any]:
        self.configuration.save_audio_generation({
            "api_key": str(values.get("api_key") or "").strip(),
            "base_url": str(values.get("base_url") or "").strip(),
        })
        return self.snapshot()

    def test_storage(self) -> dict[str, Any]:
        return self.configuration.test_storage()

    def test_provider(self) -> dict[str, Any]:
        return self.provider_connection_test()

    def maintenance_snapshot(self) -> dict[str, Any]:
        return self.maintenance.snapshot()

    def tidy_working_files(self, days: int = 7) -> dict[str, int]:
        return self.maintenance.tidy(days)

    def pronunciations(self) -> list[dict[str, Any]]:
        return self.pronunciation_repository.list()

    def pronunciation_preview(self, text: str) -> dict[str, Any]:
        prepared, applied = speech_text.apply_pronunciations(
            text, self.pronunciation_repository.list(enabled_only=True))
        return {"text": prepared, "applied": applied}

    def save_pronunciation(self, values: dict[str, Any]) -> int:
        pattern = str(values.get("pattern") or "").strip()
        replacement = str(values.get("replacement") or "").strip()
        if not pattern or not replacement:
            raise ValueError(
                "Both the written form and pronunciation are required.")
        saved = self.pronunciation_repository.save({
            "id": values.get("id"), "pattern": pattern,
            "replacement": replacement,
            "whole_word": bool(values.get("whole_word", True)),
            "match_case": bool(values.get("match_case", False)),
            "enabled": bool(values.get("enabled", True)),
            "phoneme": bool(values.get("phoneme", False)),
        })
        if saved is None:
            raise ValueError("That pronunciation rule no longer exists.")
        return saved

    def delete_pronunciation(self, item_id: int) -> bool:
        return self.pronunciation_repository.delete(item_id)


def _non_negative(value: Any, label: str) -> float:
    try:
        number = float(value or 0)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{label} must be a number.") from error
    if number < 0:
        raise ValueError(f"{label} cannot be negative.")
    return number
