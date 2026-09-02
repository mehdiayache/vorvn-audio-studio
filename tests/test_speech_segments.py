"""Provider-neutral Unicode boundary tests."""

import unittest

from origins.domain import speech_segments


class SpeechSegmentTests(unittest.TestCase):
    def test_paragraphs_are_preserved_and_preferred(self):
        text = "First paragraph has room.\n\nSecond paragraph stays intact."
        parts = speech_segments.split_text(text, limit=35)
        self.assertEqual(parts, [
            "First paragraph has room.",
            "Second paragraph stays intact.",
        ])
        self.assertEqual(speech_segments.comparable_text(parts),
                         " ".join(text.split()))

    def test_arabic_question_mark_and_comma_are_boundaries(self):
        text = "هل أنت بخير؟ نعم، أنا بخير والحمد لله."
        sentence_parts = speech_segments.split_text(text, limit=18)
        self.assertEqual(sentence_parts[0], "هل أنت بخير؟")
        clause_parts = speech_segments.split_text(
            "هذه مقدمة طويلة، وهذه خاتمة واضحة.", limit=19)
        self.assertEqual(clause_parts[0], "هذه مقدمة طويلة،")

    def test_no_non_whitespace_content_is_lost(self):
        text = "مرحبا\n\nبالعالم؟  This-is-a-very-long-token-without-workspaces"
        parts = speech_segments.split_text(text, limit=14)
        self.assertTrue(all(len(part) <= 14 for part in parts))
        self.assertEqual("".join("".join(part.split()) for part in parts),
                         "".join(text.split()))

    def test_groups_respect_cumulative_provider_limit(self):
        groups = speech_segments.group_by_size(
            ["a" * 8, "b" * 8, "c" * 8], limit=17)
        self.assertEqual(groups, [["a" * 8, "b" * 8], ["c" * 8]])


if __name__ == "__main__":
    unittest.main()
