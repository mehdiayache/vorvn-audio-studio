import unittest
from uuid import uuid4

from origins.domain.files import File


class FileDomainTests(unittest.TestCase):
    def test_accepts_every_supported_file_source(self):
        for source in ("generated", "uploaded", "imported"):
            with self.subTest(source=source):
                file = File(1, uuid4(), 2, "Campaign master", source=source)
                self.assertEqual(file.source, source)

    def test_rejects_an_unsupported_file_source(self):
        with self.assertRaisesRegex(ValueError, "File provenance"):
            File(1, uuid4(), 2, "Campaign master", source="external")

    def test_enforces_every_file_identity_invariant(self):
        invalid_cases = (
            ({"id": 0}, "identifiers must be positive"),
            ({"workspace_id": 0}, "identifiers must be positive"),
            ({"name": "   "}, "requires a name"),
            ({"current_version_id": 0}, "FileVersion ID must be positive"),
            ({"folder_id": 0}, "Folder ID must be positive"),
        )
        for overrides, message in invalid_cases:
            values = {
                "id": 1,
                "public_id": uuid4(),
                "workspace_id": 2,
                "name": "Campaign master",
                **overrides,
            }
            with self.subTest(overrides=overrides):
                with self.assertRaisesRegex(ValueError, message):
                    File(**values)


if __name__ == "__main__":
    unittest.main()
