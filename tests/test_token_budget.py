import unittest

from audio_studio.domain import token_budget


class TokenBudgetTests(unittest.TestCase):
    def test_non_ascii_is_budgeted_conservatively(self):
        self.assertEqual(token_budget.conservative_qwen_tokens("مرحبا"), 5)
        self.assertEqual(token_budget.conservative_qwen_tokens("hello"), 2)
        self.assertEqual(
            token_budget.conservative_qwen_tokens("long_identifier_name"), 5)

    def test_long_text_keeps_order_under_budget(self):
        text = ("A sentence with ordinary English words. " * 200).strip()
        parts = token_budget.split_to_budget(text, budget=100)
        self.assertGreater(len(parts), 1)
        self.assertTrue(all(
            token_budget.conservative_qwen_tokens(part) <= 100
            for part in parts))
        self.assertEqual(" ".join(" ".join(part.split()) for part in parts),
                         " ".join(text.split()))

    def test_arabic_punctuation_remains_a_natural_boundary(self):
        text = "هل أنت بخير؟ " * 30
        parts = token_budget.split_to_budget(text, budget=20)
        self.assertTrue(all(part.endswith("؟") for part in parts))


if __name__ == "__main__":
    unittest.main()
