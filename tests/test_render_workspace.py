"""Filesystem rollback checks for the Production render workspace."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from audio_studio.infrastructure.render_workspace import FFmpegRenderWorkspace


class RenderWorkspaceTests(unittest.TestCase):
    def test_failed_sound_scene_mix_removes_incomplete_output(self):
        def sequence(_parts: list[dict], target: Path):
            target.write_bytes(b"voice")
            return [], "fixture"

        def mix(_voice: Path, _scene: dict, target: Path):
            target.write_bytes(b"blend")
            raise OSError("mix failed")

        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / "music.mp3").write_bytes(b"music")
            with (
                patch("audio_studio.infrastructure.render_workspace._output",
                      return_value=root),
                patch("audio_studio.infrastructure.render_workspace._name",
                      return_value="final.mp3"),
                patch("audio_studio.infrastructure.render_workspace._sequence",
                      side_effect=sequence),
                patch("audio_studio.infrastructure.render_workspace._mix_scene",
                      side_effect=mix),
            ):
                with self.assertRaisesRegex(OSError, "mix failed"):
                    FFmpegRenderWorkspace().finish_export(
                        6, "Evening Reset", [{"id": 7}],
                        {
                            "signature": "scene", "voice_projection": {
                                "signature": "voice", "spans": [],
                            },
                            "tracks": [{"kind": "music", "muted": False,
                                        "clips": [{"filename": "music.mp3"}]}],
                            "orphans": [],
                        }, {"srt": "", "vtt": ""})
            self.assertEqual(
                sorted(path.name for path in root.iterdir()),
                ["music.mp3", "voice-stem-6-voice.mp3"])


if __name__ == "__main__":
    unittest.main()
