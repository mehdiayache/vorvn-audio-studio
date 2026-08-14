"""Durable voice-reference migration tests with no database/provider calls."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from audio_studio.application.reference_storage import migrate_legacy_references
from audio_studio.infrastructure.voice_reference_workspace import VoiceReferenceWorkspace


class FakeRepository:
    def __init__(self, items):
        self.items = items
        self.updated = []
        self.unavailable = []

    def references(self):
        return self.items

    def update_reference_paths(self, reference_id, **paths):
        self.updated.append((reference_id, paths))
        return True

    def mark_reference_unavailable(self, reference_id, detail):
        self.unavailable.append((reference_id, detail))


class ReferenceStorageTests(unittest.TestCase):
    def test_legacy_master_is_copied_verified_and_reindexed_by_reference_id(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            durable = root / "durable"
            legacy = root / "legacy"
            legacy.mkdir()
            (legacy / "old.wav").write_bytes(b"RIFF fixture")
            workspace = VoiceReferenceWorkspace(durable)
            workspace.legacy_root = legacy.resolve()
            repository = FakeRepository([{
                "id": "ref_12345678", "original_path": "old.wav",
                "normalized_path": "old.wav",
            }])
            self.assertEqual(
                migrate_legacy_references(repository, workspace), 1)
            original = durable / "ref_12345678" / "original.wav"
            normalized = durable / "ref_12345678" / "normalized.wav"
            self.assertEqual(original.read_bytes(), b"RIFF fixture")
            self.assertEqual(normalized.read_bytes(), b"RIFF fixture")
            self.assertTrue((legacy / "old.wav").exists())
            self.assertEqual(repository.updated[0][1], {
                "original_path": "ref_12345678/original.wav",
                "normalized_path": "ref_12345678/normalized.wav",
            })

    def test_missing_historical_master_is_diagnosed_without_blocking_startup(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            durable = root / "durable"
            legacy = root / "legacy"
            legacy.mkdir()
            workspace = VoiceReferenceWorkspace(durable)
            workspace.legacy_root = legacy.resolve()
            repository = FakeRepository([{
                "id": "ref_missing", "original_path": "gone.wav",
                "normalized_path": "gone.wav",
            }])
            self.assertEqual(
                migrate_legacy_references(repository, workspace), 0)
            self.assertEqual(repository.updated, [])
            self.assertEqual(repository.unavailable[0][0], "ref_missing")
            self.assertIn("missing", repository.unavailable[0][1])


if __name__ == "__main__":
    unittest.main()
