"""Bounded browser audio-window preparation."""

from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest

from origins.infrastructure.media_workspace import LocalMediaWorkspace


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

    def test_video_poster_and_proxy_are_cached_browser_derivatives(self):
        with TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            source = root / "source.mov"
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-f", "lavfi", "-i", "testsrc=size=320x180:rate=24",
                "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                str(source),
            ], check=True)
            workspace = LocalMediaWorkspace(
                root=root, output=root, voice_samples=root)

            poster = workspace.video_poster(source.name)
            proxy = workspace.video_proxy(source.name)
            self.assertEqual(poster, workspace.video_poster(source.name))
            self.assertEqual(proxy, workspace.video_proxy(source.name))
            self.assertTrue(poster.path.is_file())
            self.assertTrue(proxy.path.is_file())
            self.assertEqual(poster.path.suffix, ".jpg")
            self.assertEqual(proxy.path.suffix, ".mp4")
            probe = subprocess.run([
                "ffprobe", "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=codec_name,pix_fmt",
                "-of", "default=nw=1", str(proxy.path),
            ], check=True, capture_output=True, text=True)
            self.assertIn("codec_name=h264", probe.stdout)
            self.assertIn("pix_fmt=yuv420p", probe.stdout)
            self.assertIsNone(workspace.video_proxy("../source.mov"))

    def test_video_audio_proxy_is_cached_normalized_and_contained(self):
        with TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            source = root / "camera-original.mov"
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-f", "lavfi", "-i", "color=size=320x180:rate=24:color=blue",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-c:a", "aac", str(source),
            ], check=True)
            workspace = LocalMediaWorkspace(
                root=root, output=root, voice_samples=root)

            first = workspace.audio_proxy(source.name)
            second = workspace.audio_proxy(source.name)

            self.assertEqual(first, second)
            self.assertTrue(first.path.is_file())
            probe = subprocess.run([
                "ffprobe", "-v", "error", "-select_streams", "a:0",
                "-show_entries", "stream=codec_name,sample_rate,channels",
                "-of", "default=nw=1", str(first.path),
            ], check=True, capture_output=True, text=True)
            self.assertIn("codec_name=mp3", probe.stdout)
            self.assertIn("sample_rate=48000", probe.stdout)
            self.assertIn("channels=2", probe.stdout)
            self.assertIsNone(workspace.audio_proxy("../camera-original.mov"))


if __name__ == "__main__":
    unittest.main()
