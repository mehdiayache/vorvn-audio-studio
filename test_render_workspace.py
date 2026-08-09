"""Filesystem rollback checks for the Production render workspace."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from audio_studio.infrastructure.render_workspace import FFmpegRenderWorkspace


class RenderWorkspaceTests(unittest.TestCase):
    def test_failed_music_swap_removes_voice_and_blended_outputs(self):
        def sequence(_parts: list[dict], target: Path):
            target.write_bytes(b"voice")
            return [], "fixture"

        def mix(_voice: Path, _music: Path, _values: dict, target: Path):
            target.write_bytes(b"blend")

        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / "music.mp3").write_bytes(b"music")
            with (
                patch("audio_studio.infrastructure.render_workspace._output",
                      return_value=root),
                patch("audio_studio.infrastructure.render_workspace._name",
                      side_effect=["final.mp3", "blend.mp3"]),
                patch("audio_studio.infrastructure.render_workspace._sequence",
                      side_effect=sequence),
                patch("audio_studio.infrastructure.render_workspace._mix",
                      side_effect=mix),
                patch("audio_studio.infrastructure.render_workspace.os.replace",
                      side_effect=OSError("swap failed")),
            ):
                with self.assertRaisesRegex(OSError, "swap failed"):
                    FFmpegRenderWorkspace().finish_export(
                        6, "Evening Reset", [{"id": 7}],
                        {"filename": "music.mp3"}, {"srt": "", "vtt": ""})
            self.assertEqual(
                sorted(path.name for path in root.iterdir()), ["music.mp3"])


if __name__ == "__main__":
    unittest.main()
