"""Deterministic acceptance for the Sound Recipe semantic layer."""

import unittest

from audio_studio.domain.sound_recipes import compile_sound_recipe
from audio_studio.domain.sound_recipe_taxonomy import INDEX, TAXONOMY


class SoundRecipeCompilerTests(unittest.TestCase):
    def test_taxonomy_is_versioned_educational_model_data(self):
        self.assertEqual(TAXONOMY["version"], "audio-taxonomy-v1")
        item = INDEX["modifier.legato"]
        self.assertEqual(item["labels"]["en"], "Legato")
        self.assertTrue(item["help"]["audible_effect_en"])
        self.assertEqual(item["model_support"], ["small-music"])

    def test_spoken_story_does_not_invent_context_or_tempo(self):
        result = compile_sound_recipe("music", {
            "context": ["context.story"],
            "cue_role": ["cue.music_bed"],
            "voice_relationship": "voice.under_speech",
            "moods": ["mood.reflective", "mood.warm"],
            "instruments": [{"id": "instrument.felt_piano",
                             "modifiers": ["modifier.sparse"]}],
            "arrangement": {
                "density": "arrangement.density_sparse",
                "melody_prominence": "arrangement.melody_background",
            },
        })
        prompt = result.compiled_prompt
        self.assertIn("TrackType: Music", prompt)
        self.assertIn("VocalType: Instrumental", prompt)
        self.assertIn("Felt Piano", prompt)
        self.assertIn("spoken narration", prompt)
        self.assertIn("very sparse arrangement", prompt)
        self.assertNotIn("BPM", prompt)
        self.assertNotIn("church", prompt.casefold())

    def test_faith_context_never_overwrites_explicit_rock_style(self):
        result = compile_sound_recipe("music", {
            "context": ["context.faith"],
            "moment": ["moment.gathering"],
            "genres": ["genre.alternative_rock"],
            "instruments": [
                {"id": "instrument.electric_guitar"},
                {"id": "instrument.electric_bass"},
                {"id": "instrument.light_drums"},
            ],
        })
        prompt = result.compiled_prompt
        self.assertIn("Genre: Alternative rock", prompt)
        self.assertIn("faith or church production", prompt)
        self.assertNotIn("Gospel", prompt)
        self.assertNotIn("Felt Piano", prompt)

    def test_conflicting_brief_blocks_until_operator_resolves_it(self):
        state = {
            "creative_brief": "A huge explosive climax at the end",
            "arrangement": {
                "dynamics": "arrangement.dynamics_restrained",
            },
        }
        unresolved = compile_sound_recipe("music", state)
        self.assertEqual(unresolved.conflicts[0].id,
                         "restrained-vs-explosive")
        state["conflict_resolutions"] = {
            "restrained-vs-explosive": "structured"}
        resolved = compile_sound_recipe("music", state)
        self.assertEqual(resolved.conflicts, ())
        self.assertNotIn("explosive", resolved.compiled_prompt.casefold())
        self.assertIn("restrained dynamics", resolved.compiled_prompt)

    def test_keep_out_compiles_as_positive_direction(self):
        result = compile_sound_recipe("music", {
            "constraints": ["constraint.no_drama",
                            "constraint.no_busy_melody"],
        })
        self.assertIn("steady restrained dynamics", result.compiled_prompt)
        self.assertIn("low melodic prominence", result.compiled_prompt)
        self.assertNotIn("negative_prompt", result.compiled_prompt)

    def test_sfx_uses_its_own_schema_and_format_signal(self):
        result = compile_sound_recipe("sfx", {
            "source": [{"display": "Heavy wooden door",
                        "canonical_en": "a heavy wooden door"}],
            "action": ["sfx.action.slam"],
            "material": ["sfx.material.wood"],
            "perspective": "sfx.perspective.close",
            "environment": ["sfx.environment.church"],
            "envelope": ["sfx.envelope.sharp", "sfx.envelope.long_tail"],
            "character": ["sfx.character.natural", "sfx.character.weighty"],
        })
        self.assertTrue(result.compiled_prompt.startswith("TrackType: SFX"))
        self.assertIn("heavy wooden door", result.compiled_prompt)
        self.assertIn("slamming shut", result.compiled_prompt)
        self.assertIn("large reverberant church", result.compiled_prompt)
        self.assertEqual(result.semantic_schema_version, "sfx-semantic-v1")

    def test_prompt_packing_keeps_complete_high_value_sentences(self):
        result = compile_sound_recipe("music", {
            "creative_brief": "beautiful detail " * 100,
            "genres": ["genre.ambient"],
            "instruments": [{"id": "instrument.felt_piano"}],
        })
        self.assertLessEqual(len(result.compiled_prompt), 500)
        self.assertTrue(result.compiled_prompt.endswith("."))
        self.assertIn("TrackType: Music", result.compiled_prompt)


if __name__ == "__main__":
    unittest.main()

