"""Exact speech adapter dispatch; no provider calls."""

import unittest

from audio_studio.domain.speech import PreparedSpeech, SynthesizedSpeech
from audio_studio.providers.speech_registry import (
    ExactSpeechProviderRegistry,
)


class Adapter:
    def __init__(self):
        self.prepared = 0
        self.synthesized = 0

    def is_configured(self):
        return True

    def prepare(self, *, text, values, **_):
        self.prepared += 1
        return PreparedSpeech(
            original_text=text, spoken_text=text, voice="voice",
            voice_identity_id="identity", engine="audio", tier="flash",
            model_id="model", output_format="mp3", extension="mp3",
            language=None, instruction=None, speech_mode="exact", rate=1,
            pitch=1, volume=50, seed=0, request_count=1,
            estimated_cost=0, voice_route={
                "binding_id": "binding", "catalogue_voice_id": None,
                "identity_id": "identity", "reference_id": "reference",
                "provider_voice_id": "voice", "provider": "alibaba",
                "region": "intl", "adapter_key": "audio", "engine": "audio",
                "tier": "flash", "model_id": "model",
                "capability_id": "expressive",
                "capability_name": "Expressive"})

    def synthesize(self, prepared, on_progress=None):
        self.synthesized += 1
        return SynthesizedSpeech(
            audio=b"audio", cost=0, cost_basis="fixture", usage={},
            failures=[])


ROUTE = {
    "binding_id": "binding", "identity_id": "identity",
    "reference_id": "reference", "provider_voice_id": "voice",
    "provider": "alibaba", "region": "intl", "adapter_key": "audio",
    "engine": "audio", "tier": "flash", "model_id": "model",
    "status": "ready",
    "capabilities": [{"id": "expressive", "name": "Expressive"}],
}


class RegistryTests(unittest.TestCase):
    def test_exact_adapter_is_used_for_prepare_and_synthesis(self):
        adapter = Adapter()
        registry = ExactSpeechProviderRegistry({("alibaba", "audio"): adapter})
        prepared = registry.prepare(
            text="Hello", values={"binding_id": "binding"},
            bindings=[ROUTE], catalogue=[], pronunciations=[], preferences={})
        self.assertEqual(registry.synthesize(prepared).audio, b"audio")
        self.assertEqual((adapter.prepared, adapter.synthesized), (1, 1))

    def test_missing_adapter_fails_without_fallback(self):
        registry = ExactSpeechProviderRegistry({})
        with self.assertRaisesRegex(ValueError, "No speech adapter"):
            registry.prepare(
                text="Hello", values={"binding_id": "binding"},
                bindings=[ROUTE], catalogue=[], pronunciations=[],
                preferences={})

    def test_adapter_cannot_change_the_selected_model(self):
        adapter = Adapter()
        original_prepare = adapter.prepare

        def changed_model(**values):
            prepared = original_prepare(**values)
            prepared.voice_route["model_id"] = "different-model"
            return prepared

        adapter.prepare = changed_model
        registry = ExactSpeechProviderRegistry({("alibaba", "audio"): adapter})
        with self.assertRaisesRegex(RuntimeError, "changed the exact requested route"):
            registry.prepare(
                text="Hello", values={"binding_id": "binding"},
                bindings=[ROUTE], catalogue=[], pronunciations=[],
                preferences={})


if __name__ == "__main__":
    unittest.main()
