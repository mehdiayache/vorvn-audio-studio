"""Application catalogue contracts with no database, storage or provider calls."""

from types import SimpleNamespace
import unittest
from unittest.mock import patch

from audio_studio.application.catalog import CatalogService
from audio_studio.infrastructure.catalog_environment import CatalogEnvironment


class FakeVoices:
    def __init__(self):
        self.metadata = {
            "Tina": {"image": "tina.png", "favourite": True},
            "Cindy": {"image": "", "favourite": False},
        }

    def catalog_metadata(self):
        return self.metadata

    def custom_bindings(self):
        return []

    def binding_references(self):
        return {}

    def catalog_usage(self):
        return {"Tina": {"uses": 3}}


class FakeControlPlane:
    def setting(self, key, fallback=None):
        return fallback

    def spend_totals(self):
        return {"today": 1.25}

    def database_status(self):
        return {"connected": True, "count": 12}


class FakeEnvironment:
    def media_root(self):
        return "/durable/media"

    def storage_status(self):
        return {"configured": True, "bucket": "audio"}

    def storage_settings(self):
        return {"endpoint": "https://storage.example", "bucket": "audio"}


class CatalogServiceTests(unittest.TestCase):
    def setUp(self):
        self.voices = FakeVoices()
        self.service = CatalogService(
            voices=self.voices,
            control_plane=FakeControlPlane(),
            environment=FakeEnvironment(),
            load_preferences=lambda: {"default_voice": "Tina"},
        )

    def test_configuration_preserves_dynamic_runtime_facts(self):
        runtime = SimpleNamespace(
            workspace_id="workspace", region="intl",
            region_label="Singapore", native_http_base="https://api.example",
            api_key_configured=True,
        )
        with patch(
                "audio_studio.application.catalog.alibaba_environment",
                return_value=runtime):
            result = self.service.configuration()

        self.assertEqual(result["chosen_default_voice"], "Tina")
        self.assertEqual(result["voice_images"], {"Tina": "tina.png"})
        self.assertEqual(result["voice_favourites"], ["Tina"])
        self.assertEqual(result["workspace"]["region"], "intl")
        self.assertTrue(result["has_key"])
        self.assertEqual(result["out_dir"], "/durable/media")
        self.assertEqual(result["prefs"]["out_dir"], "/durable/media")
        self.assertEqual(result["spend"], {"today": 1.25})
        self.assertEqual(result["storage"]["bucket"], "audio")

    def test_voice_reads_are_delegated_without_mutation(self):
        self.assertIs(self.service.voice_metadata(), self.voices.metadata)
        self.assertEqual(self.service.voice_usage(), {"Tina": {"uses": 3}})
        registry = self.service.registry()
        self.assertTrue(registry["bindings"])
        self.assertTrue(registry["models"])

    def test_storage_adapter_never_exposes_keys(self):
        values = {
            "endpoint": "https://storage.example", "bucket": "audio",
            "access_key": "public-id", "secret_key": "secret",
            "prefix": "studio", "region": "us-east-1",
        }
        with patch(
                "audio_studio.infrastructure.catalog_environment.object_storage.settings",
                return_value=values):
            public = CatalogEnvironment().storage_settings()
        self.assertEqual(public["bucket"], "audio")
        self.assertNotIn("access_key", public)
        self.assertNotIn("secret_key", public)


if __name__ == "__main__":
    unittest.main()
