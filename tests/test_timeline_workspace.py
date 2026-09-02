"""Contained, streaming file-copy checks for Timeline media."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from origins.infrastructure.timeline_workspace import LocalTimelineWorkspace


class TimelineWorkspaceTests(unittest.TestCase):
    def test_duplicate_and_discard_stay_inside_the_media_root(self):
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            source = root / "voice.mp3"
            source.write_bytes(b"audio")
            workspace = LocalTimelineWorkspace(root)
            copied = workspace.duplicate("../voice.mp3")
            self.assertRegex(copied, r"^voice-copy-[a-f0-9]{10}\.mp3$")
            self.assertEqual((root / copied).read_bytes(), b"audio")
            workspace.discard(f"../{copied}")
            self.assertFalse((root / copied).exists())

    def test_missing_source_does_not_create_a_phantom_copy(self):
        with TemporaryDirectory() as folder:
            workspace = LocalTimelineWorkspace(Path(folder).resolve())
            self.assertEqual(workspace.duplicate("missing.mp3"), "")


if __name__ == "__main__":
    unittest.main()
