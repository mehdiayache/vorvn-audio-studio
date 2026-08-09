"""Pure speech text policy tests."""

import unittest

from audio_studio.domain import speech_text


class SpeechTextPolicyTests(unittest.TestCase):
    def test_chunking_carries_a_mood_without_losing_words(self):
        text = "[asmr] " + "A calm sentence. " * 80
        chunks = speech_text.chunk_text(text, limit=120)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk) <= 120 for chunk in chunks))
        self.assertTrue(all(chunk.startswith("[asmr]") for chunk in chunks))
        self.assertEqual(
            speech_text.strip_tags(" ".join(chunks)).count("A calm sentence."),
            80,
        )

    def test_known_tags_are_removed_but_literal_brackets_survive(self):
        result = speech_text.strip_known_tags(
            "[whispers] Read [Section 2] carefully [sighing]")
        self.assertEqual(result, "Read [Section 2] carefully")

    def test_dates_and_phone_numbers_are_rewritten_and_reported(self):
        result, changes = speech_text.normalise_ambiguous(
            "Call +1 555 123 4567 on 04/08/2026.", day_first=True)
        self.assertIn("4 August 2026", result)
        self.assertIn("plus 1 5 5 5 1 2 3 4 5 6 7", result)
        self.assertEqual(len(changes), 2)

    def test_pronunciation_rules_respect_case_words_and_phonemes(self):
        rules = [
            {"pattern": "VORVN", "replacement": "Vorven", "whole_word": True,
             "match_case": False, "phoneme": False},
            {"pattern": "Qwen", "replacement": "kwen", "whole_word": True,
             "match_case": False, "phoneme": True},
        ]
        result, applied = speech_text.apply_pronunciations(
            "vorvn and Qwen", rules)
        self.assertEqual(result, "Vorven and Qwen")
        self.assertEqual(applied[0]["count"], 1)
        self.assertEqual(speech_text.build_hot_fix(rules), {
            "pronunciation": [{"Qwen": "kwen"}],
        })

    def test_slug_and_output_contract_remain_stable(self):
        self.assertEqual(speech_text.slugify("Evening Prayer — Part 3"),
                         "evening-prayer-part-3")
        self.assertEqual(speech_text.OUTPUT_FORMATS,
                         ("mp3", "mp3-24k", "wav", "opus"))


if __name__ == "__main__":
    unittest.main()
