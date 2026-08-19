"""Filesystem rollback checks for the Production render workspace."""

from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from audio_studio.infrastructure import render_workspace
from audio_studio.infrastructure.render_workspace import FFmpegRenderWorkspace


class RenderWorkspaceTests(unittest.TestCase):
    def test_sequence_stem_keeps_a_bounded_window_for_in_flight_players(self):
        def sequence(_parts: list[dict], target: Path):
            target.write_bytes(b"sequence")

        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / "voice-stem-6-legacy.mp3").write_bytes(b"legacy")
            with (
                patch.object(render_workspace, "_output", return_value=root),
                patch.object(render_workspace, "_sequence", side_effect=sequence),
                patch.object(render_workspace, "_measure", return_value=1_000),
            ):
                workspace = FFmpegRenderWorkspace()
                for signature in ("one", "two", "three", "four"):
                    workspace.sequence_stem(6, [{"id": 7}], signature)

            stems = sorted(path.name for path in root.glob("sequence-stem-6-*.mp3"))
            self.assertEqual(len(stems), 3)
            self.assertNotIn("sequence-stem-6-one.mp3", stems)
            self.assertFalse((root / "voice-stem-6-legacy.mp3").exists())

    def test_mix_applies_track_and_clip_gain_and_ducks_only_opted_in_audio(self):
        commands: list[list[str]] = []

        def run(command, **_kwargs):
            commands.append(command)
            Path(command[-1]).write_bytes(b"mixed")
            return type("Result", (), {"returncode": 0, "stderr": b""})()

        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            sequence = root / "sequence.mp3"
            sequence.write_bytes(b"sequence")
            for name in ("ducked.mp3", "dry.mp3"):
                (root / name).write_bytes(b"source")
            scene = {
                "sequence_projection": {"duration_ms": 10_000},
                "tracks": [
                    {
                        "id": "music", "kind": "music", "volume": .5,
                        "muted": False, "clips": [{
                            "filename": "ducked.mp3", "gain": .4,
                            "resolved_start_ms": 0,
                            "resolved_duration_ms": 10_000,
                            "source_offset_ms": 0, "fade_in_ms": 0,
                            "fade_out_ms": 0, "loop": True,
                            "ducking": True, "orphan": False,
                            "missing": False,
                        }],
                    },
                    {
                        "id": "future-sfx", "kind": "sfx", "volume": .8,
                        "muted": False, "clips": [{
                            "filename": "dry.mp3", "gain": .5,
                            "resolved_start_ms": 1_000,
                            "resolved_duration_ms": 2_000,
                            "source_offset_ms": 0, "fade_in_ms": 0,
                            "fade_out_ms": 0, "loop": False,
                            "ducking": False, "orphan": False,
                            "missing": False,
                        }],
                    },
                ],
            }
            target = root / "mixed.mp3"
            with (
                patch.object(render_workspace, "_output", return_value=root),
                patch.object(render_workspace.subprocess, "run",
                             side_effect=run),
            ):
                self.assertTrue(render_workspace._mix_scene(
                    sequence, scene, target))

        filters = commands[0][commands[0].index("-filter_complex") + 1]
        self.assertIn("volume=0.2000", filters)
        self.assertIn("volume=0.4000", filters)
        self.assertIn("[scene1][detector]sidechaincompress", filters)
        self.assertIn("[under][scene2]amix=inputs=2", filters)

    def test_mix_builds_sequence_effect_buses_and_keeps_the_echo_tail(self):
        commands: list[list[str]] = []

        def run(command, **_kwargs):
            commands.append(command)
            Path(command[-1]).write_bytes(b"mixed")
            return type("Result", (), {"returncode": 0, "stderr": b""})()

        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            sequence = root / "sequence.mp3"
            sequence.write_bytes(b"sequence")
            scene = {
                "duration_ms": 3_750,
                "sequence_projection": {
                    "duration_ms": 2_000,
                    "spans": [{
                        "start_ms": 0, "duration_ms": 2_000,
                        "mix": {
                            "muted": False, "gain": .8,
                            "fade_in_ms": 100, "fade_out_ms": 200,
                            "effects": [
                                {
                                    "id": "telephone", "type": "telephone",
                                    "enabled": True,
                                },
                                {
                                    "id": "echo", "type": "echo",
                                    "enabled": True, "delay_ms": 250,
                                    "feedback": .5, "mix": .3,
                                },
                            ],
                        },
                    }],
                },
                "tracks": [],
            }
            target = root / "mixed.mp3"
            with patch.object(render_workspace.subprocess, "run", side_effect=run):
                self.assertTrue(render_workspace._mix_scene(
                    sequence, scene, target))

        filters = commands[0][commands[0].index("-filter_complex") + 1]
        self.assertIn("highpass=f=300:p=2,lowpass=f=3400:p=2", filters)
        self.assertIn("asplit=2[seq0dryin1][seq0echoin1]", filters)
        self.assertIn("aecho=1:1:250|500|750", filters)
        self.assertIn("adelay=0|0[sequencepart0]", filters)
        self.assertIn("atrim=duration=3.750", filters)

    def test_muted_sound_clip_never_enters_the_render_graph(self):
        scene = {
            "tracks": [{
                "kind": "music", "volume": 1, "muted": False,
                "clips": [{
                    "muted": True, "gain": 1, "orphan": False,
                    "missing": False, "resolved_duration_ms": 1_000,
                }],
            }],
        }

        self.assertEqual(render_workspace._sound_clips(scene), [])

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                         "FFmpeg is required for the render acceptance.")
    def test_real_ffmpeg_sequence_echo_renders_its_declared_tail(self):
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            sequence = root / "sequence.wav"
            target = root / "mixed.mp3"
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                "-ar", "48000", "-ac", "2", str(sequence),
            ], check=True)
            scene = {
                "duration_ms": 2_750,
                "sequence_projection": {
                    "duration_ms": 1_000,
                    "spans": [{
                        "start_ms": 0, "duration_ms": 1_000,
                        "mix": {
                            "muted": False, "gain": 1,
                            "fade_in_ms": 0, "fade_out_ms": 0,
                            "effects": [{
                                "id": "echo", "type": "echo",
                                "enabled": True, "delay_ms": 250,
                                "feedback": .5, "mix": .3,
                            }],
                        },
                    }],
                },
                "tracks": [],
            }

            self.assertTrue(render_workspace._mix_scene(sequence, scene, target))

            duration_ms = render_workspace._measure(target)
            self.assertIsNotNone(duration_ms)
            self.assertGreaterEqual(duration_ms or 0, 2_700)
            self.assertLessEqual(duration_ms or 0, 2_850)

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
                            "signature": "scene", "sequence_projection": {
                                "signature": "voice", "spans": [],
                            },
                            "tracks": [{"kind": "music", "volume": 1,
                                        "muted": False,
                                        "clips": [{"filename": "music.mp3"}]}],
                            "orphans": [],
                        }, {"srt": "", "vtt": ""})
            self.assertEqual(
                sorted(path.name for path in root.iterdir()),
                ["music.mp3", "sequence-stem-6-voice.mp3"])


if __name__ == "__main__":
    unittest.main()
