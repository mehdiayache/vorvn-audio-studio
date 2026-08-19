"""Bounded browser audio-window preparation."""

from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest

from audio_studio.infrastructure.media_workspace import LocalMediaWorkspace


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "FFmpeg is required for audio-window acceptance.")
class MediaWorkspaceTests(unittest.TestCase):
    def test_segment_is_exact_cached_and_contained(self):
        with TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            source = root / "long-bed.wav"
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-f", "lavfi", "-i", "sine=frequency=220:duration=3",
                "-ar", "48000", "-ac", "2", str(source),
            ], check=True)
            workspace = LocalMediaWorkspace(
                root=root, output=root, voice_samples=root)

            first = workspace.segment(
                source.name, offset_ms=1_000, duration_ms=1_400)
            second = workspace.segment(
                source.name, offset_ms=1_000, duration_ms=1_400)

            self.assertIsNotNone(first)
            self.assertEqual(first, second)
            self.assertTrue(first.path.is_file())
            measured = subprocess.run([
                "ffprobe", "-v", "error", "-show_entries",
                "format=duration", "-of", "default=nw=1:nk=1",
                str(first.path),
            ], check=True, capture_output=True, text=True)
            self.assertAlmostEqual(float(measured.stdout), 1.4, delta=.05)
            self.assertIsNone(workspace.segment(
                "../long-bed.wav", offset_ms=0, duration_ms=1_000))


if __name__ == "__main__":
    unittest.main()
