"""Media lookup use cases with no filesystem or database access."""

from pathlib import Path
import unittest

from audio_studio.application.media import MediaService
from audio_studio.domain.media import MediaFile


class FakeWorkspace:
    def __init__(self):
        self.lookups = []

    def resolve(
            self, kind, name, folder=None, *, download_name=None):
        self.lookups.append((kind, name, folder, download_name))
        if name == "missing.mp3":
            return None
        return MediaFile(Path("/safe") / name, download_name)


class FakeRecords:
    def export(self, export_id):
        return ({"id": export_id, "filename": "final.mp3"}
                if export_id == 91 else None)

    def take(self, take_id):
        return ({"id": take_id, "filename": "take.mp3"}
                if take_id == 150 else None)


class MediaServiceTests(unittest.TestCase):
    def setUp(self):
        self.workspace = FakeWorkspace()
        self.service = MediaService(self.workspace, FakeRecords())

    def test_named_media_uses_one_workspace(self):
        audio = self.service.resolve("audio", "take.mp3")
        self.assertEqual(audio.download_name, None)
        self.assertEqual(
            self.workspace.lookups,
            [("audio", "take.mp3", None, None)],
        )

    def test_export_and_take_ids_resolve_persisted_names(self):
        exported = self.service.export_file(91)
        generated = self.service.take_file(150)
        self.assertEqual(exported.download_name, "final.mp3")
        self.assertEqual(generated.download_name, "take.mp3")
        self.assertIsNone(self.service.export_file(404))
        self.assertIsNone(self.service.take_file(404))


if __name__ == "__main__":
    unittest.main()
