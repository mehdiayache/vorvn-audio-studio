"""Pure naming policy tests."""

import unittest

from origins.domain import naming


class NamingPolicyTests(unittest.TestCase):
    def test_blank_workspace_values_inherit_global_settings(self):
        result = naming.merged({"prefix": "hearts"}, {"prefix": "", "digits": 3})
        self.assertEqual(result["prefix"], "hearts")
        self.assertEqual(result["digits"], 3)

    def test_download_name_is_readable_safe_and_stably_numbered(self):
        result = naming.download_name(
            {"production": "Sleep", "folder": "صلاة النوم — Evening", "part": 3},
            naming.merged({"prefix": "origins", "include_production": True}, None),
        )
        self.assertEqual(result, "origins-Sleep-صلاة-النوم-Evening-part-03.mp3")

    def test_metadata_uses_human_context_and_omits_blank_fields(self):
        settings = naming.merged({}, None)
        result = naming.id3(
            {"workspace": "Heartsnotes", "production": "Sleep", "folder": "Prayer", "part": 2},
            settings,
        )
        self.assertEqual(result["artist"], "Heartsnotes")
        self.assertEqual(result["album"], "Sleep")
        self.assertEqual(result["title"], "Prayer — Part 2")
        self.assertNotIn("genre", result)

    def test_unknown_template_tokens_remain_visible(self):
        self.assertEqual(naming.fill("{workspace} {typo}", {"workspace": "Origins"}),
                         "Origins {typo}")


if __name__ == "__main__":
    unittest.main()
