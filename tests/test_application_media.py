"""Media lookup use cases with no filesystem or database access."""

from pathlib import Path
import unittest

from origins.application.media import MediaService
from origins.domain.media import MediaFile


class FakeWorkspace:
    def __init__(self):
        self.lookups = []

    def resolve(
            self, kind, name, folder=None, *, download_name=None):
        self.lookups.append((kind, name, folder, download_name))
        if name == "missing.mp3":
            return None
        return MediaFile(Path("/safe") / name, download_name)

    def segment(self, name, *, offset_ms, duration_ms):
        self.lookups.append(("segment", name, offset_ms, duration_ms))
        return MediaFile(Path("/safe") / f"segment-{name}")


class FakeRecords:
    def export(self, export_id):
        return ({"id": export_id, "filename": "final.mp3"}
                if export_id == 91 else None)

    def clip(self, clip_id):
        return ({"id": clip_id, "filename": "clip.mp3"}
                if clip_id == 150 else None)


class MediaServiceTests(unittest.TestCase):
    def setUp(self):
        self.workspace = FakeWorkspace()
        self.service = MediaService(self.workspace, FakeRecords())

    def test_named_media_uses_one_workspace(self):
        audio = self.service.resolve("audio", "clip.mp3")
        self.assertEqual(audio.download_name, None)
        self.assertEqual(
            self.workspace.lookups,
            [("audio", "clip.mp3", None, None)],
        )

    def test_export_and_recording_ids_resolve_persisted_names(self):
        exported = self.service.export_file(91)
        generated = self.service.recording_file(150)
        self.assertEqual(exported.download_name, "final.mp3")
        self.assertEqual(generated.download_name, "clip.mp3")
        self.assertIsNone(self.service.export_file(404))
        self.assertIsNone(self.service.recording_file(404))

    def test_audio_segment_keeps_source_window_explicit(self):
        segment = self.service.audio_segment(
            "long-bed.mp3", offset_ms=37_000, duration_ms=1_400)

        self.assertEqual(segment.path.name, "segment-long-bed.mp3")
        self.assertEqual(self.workspace.lookups, [
            ("segment", "long-bed.mp3", 37_000, 1_400),
        ])


if __name__ == "__main__":
    unittest.main()
