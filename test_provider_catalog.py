"""Provider catalogue ownership and compatibility tests."""

import unittest

from audio_studio.domain import provider_catalog


class ProviderCatalogTests(unittest.TestCase):
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
