"""Subtitle layout tests are pure: no database, storage or provider calls."""

import unittest

from audio_studio.domain import captions


WORDS = [
    {"start": 160, "end": 520, "text": "Welcome"},
    {"start": 520, "end": 720, "text": "to"},
    {"start": 720, "end": 1120, "text": "Hearts"},
    {"start": 1120, "end": 1450, "text": "Notes,"},
    {"start": 1450, "end": 1650, "text": "a"},
    {"start": 1650, "end": 1940, "text": "home"},
    {"start": 1940, "end": 2150, "text": "for"},
    {"start": 2150, "end": 2500, "text": "women"},
    {"start": 2500, "end": 2750, "text": "and"},
    {"start": 2750, "end": 3200, "text": "families"},
    {"start": 3200, "end": 3500, "text": "brought"},
    {"start": 3500, "end": 3850, "text": "together"},
    {"start": 3850, "end": 4100, "text": "by"},
    {"start": 4100, "end": 5120, "text": "faith."},
]
SOURCE = [{
    "start": 160,
    "end": 5120,
    "text": "Welcome to Hearts Notes, a home for women and families brought together by faith.",
    "words": WORDS,
}]


class CaptionLayoutTests(unittest.TestCase):
    def test_standard_keeps_the_readable_sample_as_one_cue(self):
        cues = captions.build_cues(SOURCE, "standard")
        self.assertEqual(len(cues), 1)
        self.assertLessEqual(max(map(len, cues[0]["text"].splitlines())), 42)

    def test_short_profile_uses_compact_word_aligned_cues(self):
        cues = captions.build_cues(SOURCE, "short")
        self.assertGreater(len(cues), 1)
        self.assertTrue(all(len(cue["words"]) <= 5 for cue in cues))
        self.assertTrue(all(cue["end"] - cue["start"] <= 2500 for cue in cues))
        self.assertTrue(all(cue["timing"] == "word" for cue in cues))

    def test_word_profile_preserves_every_source_word(self):
        cues = captions.build_cues(SOURCE, "words")
        self.assertEqual(len(cues), len(WORDS))
        self.assertEqual(cues[0]["start"], WORDS[0]["start"])
        self.assertEqual(cues[-1]["words"][0]["text"], "faith.")

    def test_missing_word_timings_are_estimated_without_provider_access(self):
        source = [{"start": 0, "end": 2000, "text": "مرحبا بكم في المنزل"}]
        result = captions.layout(source, "short")
        self.assertEqual(result["timing_quality"], "estimated")
        self.assertEqual(result["cues"][0]["start"], 0)
        self.assertEqual(result["cues"][-1]["end"], 2000)
        self.assertIn("مرحبا", result["srt"])

    def test_exports_have_the_expected_timestamp_dialects(self):
        result = captions.layout(SOURCE, "standard")
        self.assertIn("00:00:00,160 --> 00:00:05,120", result["srt"])
        self.assertIn("00:00:00.160 --> 00:00:05.120", result["vtt"])

    def test_zero_length_provider_word_is_marked_estimated_and_readable(self):
        result = captions.layout([{
            "start": 23600, "end": 23600, "text": "Org.",
            "words": [{"start": 23600, "end": 23600, "text": "Org."}],
        }], "words")
        self.assertEqual(result["timing_quality"], "estimated")
        self.assertLess(result["metrics"]["maximum_cps"], 100)

    def test_zero_length_word_sharing_the_next_start_gets_a_real_slice(self):
        result = captions.layout([{
            "start": 1000, "end": 1600, "text": "at home",
            "words": [
                {"start": 1000, "end": 1000, "text": "at"},
                {"start": 1000, "end": 1600, "text": "home"},
            ],
        }], "words")
        self.assertGreaterEqual(result["cues"][0]["end"] - result["cues"][0]["start"], 80)
        self.assertEqual(result["cues"][0]["end"], result["cues"][1]["start"])


if __name__ == "__main__":
    unittest.main()
