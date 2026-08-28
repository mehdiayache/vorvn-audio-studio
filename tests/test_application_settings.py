"""Pure contracts for the injected Settings application service."""

from __future__ import annotations

import unittest

from audio_studio.application.settings import SettingsService


class ControlPlaneFake:
    def __init__(self):
        self.values = {}

    def setting(self, key, fallback=None):
        return self.values.get(key, fallback)

    def save_setting(self, key, value):
        if value is None:
            self.values.pop(key, None)
        else:
            self.values[key] = value
        return True

    def spend_totals(self):
        return {"today": 1.25, "month": 2.5, "all_time": 4.0, "runs": 7}

    def database_status(self):
        return {"connected": True, "count": 12}


class ConfigurationFake:
    def __init__(self):
        self.saved_provider = None
        self.saved_audio_catalog = None
        self.saved_audio_generation = None
        self.saved_storage = None
        self.storage_values = {
            "endpoint": "https://storage.test", "bucket": "private",
            "prefix": "audio", "region": "us-east-1",
            "organization_id": "local-studio",
            "access_key": "access-secret", "secret_key": "hidden-secret",
        }

    def provider(self):
        return {
            "name": "Alibaba Model Studio", "configured": True,
            "workspace_configured": True, "workspace_id": "workspace",
            "region": "intl", "region_label": "Singapore",
            "http_base": "https://provider.test/api/v1",
        }

    def storage(self):
        return dict(self.storage_values)

    def audio_catalog(self):
        return {
            "provider": "Freesound", "search_configured": True,
            "oauth_client_configured": True, "keep_configured": False,
            "keep_reason": "Reconnect Freesound.",
            "authorization_url": "https://freesound.test/authorize",
        }

    def audio_generation(self):
        return {
            "provider": "VORVN Audio", "configured": True,
            "sfx_ready": True, "music_ready": True, "reason": "",
            "base_url": "https://audio.test", "models": {},
        }

    def storage_configured(self):
        return True

    def test_storage(self):
        return {"configured": True, "bucket": "private"}

    def save_provider(self, values):
        self.saved_provider = values

    def save_audio_catalog(self, values):
        self.saved_audio_catalog = values

    def save_audio_generation(self, values):
        self.saved_audio_generation = values

    def save_storage(self, values):
        self.saved_storage = values

    def output_directory(self):
        return "/media/audio"


class MaintenanceFake:
    def snapshot(self):
        return {"scratch_total": 20, "protected_total": 40}

    def tidy(self, days=7):
        return {"removed": days, "freed": days * 10}


class PronunciationFake:
    def __init__(self):
        self.rules = []

    def list(self, *, enabled_only=False):
        return [rule for rule in self.rules
                if not enabled_only or rule.get("enabled")]

    def save(self, entry):
        saved = {**entry, "id": entry.get("id") or 1}
        self.rules = [saved]
        return saved["id"]

    def delete(self, entry_id):
        found = any(rule["id"] == entry_id for rule in self.rules)
        self.rules = [rule for rule in self.rules if rule["id"] != entry_id]
        return found


class SettingsServiceTests(unittest.TestCase):
    def setUp(self):
        self.control = ControlPlaneFake()
        self.configuration = ConfigurationFake()
        self.maintenance = MaintenanceFake()
        self.pronunciations = PronunciationFake()
        self.preferences = {
            "warn_above": 1, "daily_cap": 0,
            "fix_dates_phones": True, "day_first": True,
            "synth_flags": {"enable_tn": True}, "extra_params": "",
        }
        self.service = SettingsService(
            control_plane=self.control,
            configuration=self.configuration,
            maintenance=self.maintenance,
            pronunciations=self.pronunciations,
            provider_connection_test=lambda: {
                "connected": True, "provider": "alibaba"},
            load_preferences=lambda: dict(self.preferences),
            save_preferences=self._save_preferences,
        )

    def _save_preferences(self, values):
        self.preferences = dict(values)
        return dict(values)

    def test_snapshot_exposes_configuration_state_but_never_secrets(self):
        result = self.service.snapshot()
        self.assertTrue(result["provider"]["configured"])
        self.assertTrue(result["audio_catalog"]["search_configured"])
        self.assertFalse(result["audio_catalog"]["keep_configured"])
        self.assertTrue(result["audio_generation"]["configured"])
        self.assertEqual(result["output_directory"], "/media/audio")
        self.assertTrue(result["storage"]["configured"])
        self.assertNotIn("access_key", result["storage_settings"])
        self.assertNotIn("secret_key", result["storage_settings"])
        self.assertTrue(result["storage_settings"]["access_key_configured"])
        self.assertTrue(result["storage_settings"]["secret_key_configured"])

    def test_provider_validation_and_storage_updates_use_the_ports(self):
        with self.assertRaisesRegex(ValueError, "Singapore or Beijing"):
            self.service.update_provider({"region": "moon"})
        self.service.update_provider({
            "region": "beijing", "workspace_id": "  ws-cn  ",
            "api_key": "  secret  ",
        })
        self.assertEqual(self.configuration.saved_provider, {
            "region": "beijing", "workspace_id": "ws-cn",
            "api_key": "secret",
        })
        self.service.update_storage({"bucket": "new-private"})
        self.assertEqual(
            self.configuration.saved_storage, {"bucket": "new-private"})
        self.assertTrue(self.service.test_provider()["connected"])

    def test_freesound_secret_updates_use_the_configuration_port(self):
        result = self.service.update_audio_catalog({
            "api_token": "  search-secret  ",
            "client_id": "  public-client  ",
            "authorization_code": "  one-time-code  ",
        })
        self.assertEqual(self.configuration.saved_audio_catalog, {
            "api_token": "search-secret",
            "client_id": "public-client",
            "authorization_code": "one-time-code",
        })
        self.assertNotIn("api_token", result["audio_catalog"])
        self.assertNotIn("authorization_code", result["audio_catalog"])

    def test_audio_generation_secret_uses_the_configuration_port(self):
        result = self.service.update_audio_generation({
            "api_key": "  private-key  ",
            "base_url": "  https://audio.test  ",
        })
        self.assertEqual(self.configuration.saved_audio_generation, {
            "api_key": "private-key", "base_url": "https://audio.test",
        })
        self.assertNotIn("api_key", result["audio_generation"])

    def test_preferences_filter_unknown_provider_flags_and_naming_fields(self):
        self.service.update({
            "warn_above": "2.5", "daily_cap": 8,
            "synth_flags": {"enable_tn": False, "unknown": True},
            "extra_params": '{"new_provider_option": true}',
            "naming": {"artist": "{venture}", "unknown": "discard"},
        })
        self.assertEqual(self.preferences["warn_above"], 2.5)
        self.assertEqual(self.preferences["synth_flags"], {"enable_tn": False})
        self.assertNotIn("unknown", self.control.values["naming"])
        with self.assertRaisesRegex(ValueError, "JSON object"):
            self.service.update({"extra_params": "[]"})

    def test_pronunciation_and_maintenance_flows_remain_owned_by_the_service(self):
        item_id = self.service.save_pronunciation({
            "pattern": " Qwen ", "replacement": " kwen ", "enabled": True,
        })
        self.assertEqual(item_id, 1)
        self.assertEqual(
            self.service.pronunciation_preview("Use Qwen")["text"], "Use kwen")
        self.assertEqual(
            self.service.maintenance_snapshot()["protected_total"], 40)
        self.assertEqual(
            self.service.tidy_working_files(3), {"removed": 3, "freed": 30})
        self.assertTrue(self.service.delete_pronunciation(item_id))


if __name__ == "__main__":
    unittest.main()
