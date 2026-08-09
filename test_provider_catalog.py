"""Provider catalogue ownership and compatibility tests."""

import unittest

from audio_studio.domain import provider_catalog
from services.alibaba import config as transitional_config


class ProviderCatalogTests(unittest.TestCase):
    def test_transitional_config_reexports_the_canonical_catalog(self):
        self.assertIs(transitional_config.CAPABILITIES,
                      provider_catalog.CAPABILITIES)
        self.assertIs(transitional_config.AUDIO_CLONE_LANGUAGES,
                      provider_catalog.AUDIO_CLONE_LANGUAGES)
        self.assertIs(transitional_config.OMNI_CLONE_LANGUAGES,
                      provider_catalog.OMNI_CLONE_LANGUAGES)

    def test_documented_snapshot_supplies_every_system_voice(self):
        snapshot = provider_catalog.documented_voice_catalog()
        expected_audio = {
            tier: {voice["id"] for voice in snapshot["audio"][tier]}
            for tier in ("plus", "flash")
        }
        actual_audio = {
            tier: set(voices)
            for tier, voices in provider_catalog.AUDIO_SYSTEM_VOICES.items()
        }
        self.assertEqual(actual_audio, expected_audio)
        self.assertEqual(set(provider_catalog.OMNI_SYSTEM_VOICES),
                         {voice["id"] for voice in snapshot["omni"]})

    def test_model_and_language_routing_contract_is_unchanged(self):
        self.assertEqual(provider_catalog.model_id("audio", "flash"),
                         "qwen-audio-3.0-tts-flash")
        self.assertEqual(provider_catalog.model_id("omni", "plus"),
                         "qwen3.5-omni-plus")
        self.assertEqual(provider_catalog.recommended_engine("Arabic"), "omni")
        self.assertEqual(provider_catalog.recommended_engine("English"), "audio")


if __name__ == "__main__":
    unittest.main()
