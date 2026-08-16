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
        self.assertEqual(set(snapshot), {"source", "audio"})

    def test_only_installed_exact_text_models_resolve(self):
        self.assertEqual(provider_catalog.model_id("audio", "flash"),
                         "qwen-audio-3.0-tts-flash")
        self.assertEqual(provider_catalog.model_id("qwen_tts", "vc"),
                         "qwen3-tts-vc-2026-01-22")
        self.assertEqual(provider_catalog.model_id("cosyvoice", "plus"),
                         "cosyvoice-v3-plus")
        with self.assertRaisesRegex(ValueError, "Unknown speech engine"):
            provider_catalog.model_id("removed", "plus")

    def test_each_provider_owns_its_real_segmentation_contract(self):
        self.assertEqual(
            provider_catalog.SEGMENTATION["audio"], {
                "mode": "continuous_session",
                "characters_per_submission": 20_000,
                "characters_per_session": 200_000,
            })
        self.assertEqual(
            provider_catalog.SEGMENTATION["qwen_tts"]
            ["provider_token_limit"], 512)
        self.assertEqual(set(provider_catalog.SEGMENTATION),
                         {"audio", "qwen_tts", "cosyvoice"})


if __name__ == "__main__":
    unittest.main()
