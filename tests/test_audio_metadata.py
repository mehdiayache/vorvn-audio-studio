"""FFmpeg metadata adapter tests without invoking FFmpeg."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from origins.infrastructure.audio_metadata import write_tags


class AudioMetadataTests(unittest.TestCase):
    def test_writer_maps_cover_and_tags_without_reencoding(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.mp3"
            target = root / "target.mp3"
            cover = root / "cover.jpg"
            source.write_bytes(b"audio")
            cover.write_bytes(b"image")

            def finish(command, **_kwargs):
                target.write_bytes(b"tagged")
                return type("Done", (), {"returncode": 0})()

            with patch("origins.infrastructure.audio_metadata.subprocess.run",
                       side_effect=finish) as run:
                self.assertTrue(write_tags(
                    source, target, {"artist": "Heartsnotes"}, cover))

            command = run.call_args.args[0]
            self.assertIn("copy", command)
            self.assertIn("artist=Heartsnotes", command)
            self.assertIn(str(cover), command)

    def test_writer_fails_safely_when_ffmpeg_is_unavailable(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with patch("origins.infrastructure.audio_metadata.subprocess.run",
                       side_effect=FileNotFoundError):
                self.assertFalse(write_tags(root / "source.mp3", root / "target.mp3", {}))


if __name__ == "__main__":
    unittest.main()
