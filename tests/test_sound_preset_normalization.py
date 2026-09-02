"""Sound Preset free-language normalization stays durable and bounded."""

import json
import unittest

from origins.application.provider_operations import ProviderOperationService
from origins.application.sound_preset_normalization import (
    SoundPresetNormalizationService,
)
from origins.domain.text import ProviderText
from test_support import FakeProviderOperationsRepository


class FakeProvider:
    def __init__(self, response: dict):
        self.response = response
        self.calls = []

    def complete(self, **request):
        self.calls.append(request)
        return ProviderText(
            json.dumps(self.response, ensure_ascii=False),
            {"prompt_tokens": 40, "completion_tokens": 20},
            "normalization-request", "intl", "https://example.test/v1",
        )


class SoundPresetNormalizationTests(unittest.TestCase):
    def service(self, provider):
        operations = FakeProviderOperationsRepository()
        return SoundPresetNormalizationService(
            provider, lambda: {"warn_above": 0, "daily_cap": 0},
            ProviderOperationService(operations)), operations

    def test_normalizes_brief_and_custom_instrument_once(self):
        provider = FakeProvider({
            "brief_en": "A restrained fragile bed beneath narration",
            "custom_values": [{
                "id": "custom_1",
                "canonical_en": "gently rubbed glass bottles",
            }],
        })
        service, operations = self.service(provider)

        result = service.normalize(
            job_id=41, capability="music",
            semantic_state={
                "creative_brief": "Une musique fragile sous la narration",
                "genres": ["genre.ambient"],
                "instruments": [{"id": {
                    "display": "bouteilles en verre frottées doucement",
                    "canonical_en": "bouteilles en verre frottées doucement",
                    "source": "custom",
                }}],
            },
            source_free_text="Une musique fragile sous la narration")

        self.assertEqual(len(provider.calls), 1)
        state = result["semantic_state"]
        self.assertEqual(
            state["creative_brief"],
            "Une musique fragile sous la narration")
        self.assertEqual(
            state["creative_brief_en"],
            "A restrained fragile bed beneath narration")
        instrument = state["instruments"][0]["id"]
        self.assertEqual(
            instrument["display"],
            "bouteilles en verre frottées doucement")
        self.assertEqual(
            instrument["canonical_en"],
            "gently rubbed glass bottles")
        self.assertIn("gently rubbed glass bottles", result["compiled_prompt"])
        self.assertNotIn("bouteilles en verre", result["compiled_prompt"])
        finish = next(event for event in operations.events
                      if event[0] == "finish")
        self.assertEqual(finish[2], "succeeded")
        self.assertTrue(finish[3]["receipt"]["usable_result"])

    def test_known_taxonomy_only_skips_language_provider(self):
        provider = FakeProvider({})
        service, operations = self.service(provider)

        result = service.normalize(
            job_id=42, capability="music",
            semantic_state={
                "genres": ["genre.ambient"],
                "moods": ["mood.warm"],
            }, source_free_text="")

        self.assertEqual(provider.calls, [])
        self.assertEqual(operations.events, [])
        self.assertIn("Genre: Ambient", result["compiled_prompt"])
        self.assertEqual(result["normalization_cost"], 0)

    def test_unchanged_normalized_language_is_not_paid_twice(self):
        provider = FakeProvider({
            "brief_en": "A delicate bell in a quiet chapel",
            "custom_values": [],
        })
        service, operations = self.service(provider)
        first = service.normalize(
            job_id=44, capability="sfx", semantic_state={},
            source_free_text="Une cloche délicate dans une chapelle calme")

        second = service.normalize(
            job_id=45, capability="sfx",
            semantic_state=first["semantic_state"],
            source_free_text=first["source_free_text"])

        self.assertEqual(len(provider.calls), 1)
        self.assertEqual(second["normalization_cost"], 0)
        reserves = [event for event in operations.events
                    if event[0] == "reserve"]
        self.assertEqual(len(reserves), 1)

    def test_unusable_provider_json_is_billed_but_not_accepted(self):
        provider = FakeProvider({"brief_en": "Translated", "custom_values": []})
        service, operations = self.service(provider)

        with self.assertRaisesRegex(ValueError, "missed a custom direction"):
            service.normalize(
                job_id=43, capability="sfx",
                semantic_state={"source": [{
                    "display": "porte lourde",
                    "canonical_en": "porte lourde",
                    "source": "custom",
                }]}, source_free_text="un bruit sec")

        finish = next(event for event in operations.events
                      if event[0] == "finish")
        self.assertEqual(finish[2], "succeeded")
        self.assertGreater(finish[3]["cost"], 0)
        self.assertFalse(finish[3]["receipt"]["usable_result"])


if __name__ == "__main__":
    unittest.main()
