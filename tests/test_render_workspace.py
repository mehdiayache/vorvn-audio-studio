"""Filesystem rollback checks for the Production render workspace."""

from pathlib import Path
import json
import math
import shutil
import subprocess
import struct
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import wave

from audio_studio.infrastructure import render_workspace
from audio_studio.infrastructure.render_workspace import FFmpegRenderWorkspace


class RenderWorkspaceTests(unittest.TestCase):
    def test_mix_builds_every_supported_primitive_and_master_safety(self):
        commands: list[list[str]] = []

        def run(command, **_kwargs):
            commands.append(command)
            Path(command[-1]).write_bytes(b"mixed")
            return type("Result", (), {"returncode": 0, "stderr": b""})()

        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            sequence = root / "sequence.mp3"
            source = root / "source.wav"
            sequence.write_bytes(b"sequence")
            source.write_bytes(b"source")
            scene = {
                "duration_ms": 1_500,
                "sequence_projection": {"duration_ms": 1_000, "spans": []},
                "tracks": [{
                    "id": "audio", "kind": "audio", "volume": 1,
                    "muted": False, "clips": [{
                        "filename": source.name, "gain": 1,
                        "resolved_start_ms": 0, "resolved_duration_ms": 1_000,
                        "source_offset_ms": 0, "fade_in_ms": 0,
                        "fade_out_ms": 0, "loop": False, "ducking": False,
                        "orphan": False, "missing": False,
                        "effects": [
                            {"type": "filter", "enabled": True,
                             "mode": "highpass", "frequency_hz": 120, "q": .8},
                            {"type": "compressor", "enabled": True,
                             "threshold_db": -18, "ratio": 4, "attack_ms": 12,
                             "release_ms": 180, "makeup_db": 2},
                            {"type": "reverb", "enabled": True,
                             "room_size": .5, "mix": .2},
                            {"type": "distortion", "enabled": True,
                             "amount": .3, "mix": .25},
                            {"type": "pan", "enabled": True, "pan": -.4},
                        ],
                    }],
                }],
            }
            with (
                patch.object(render_workspace, "_output", return_value=root),
                patch.object(render_workspace.subprocess, "run", side_effect=run),
            ):
                self.assertTrue(render_workspace._mix_scene(
                    sequence, scene, root / "mixed.mp3"))

        graph = commands[0][commands[0].index("-filter_complex") + 1]
        self.assertIn("highpass=f=120:t=q:w=0.8000", graph)
        self.assertIn("acompressor=threshold=", graph)
        self.assertIn("aecho=0:1:", graph)
        self.assertIn("asoftclip=type=tanh", graph)
        self.assertIn("stereotools=balance_out=-0.400000", graph)
        self.assertIn(
            "alimiter=limit=0.891251:attack=5:release=50:level=0:latency=1",
            graph,
        )

    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg is required")
    def test_real_ffmpeg_master_is_limited_and_reports_loudness(self):
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            sequence = root / "sequence.wav"
            source = root / "source.wav"
            target = root / "master.mp3"
            for path, frequency in ((sequence, 440), (source, 880)):
                subprocess.run([
                    "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                    "-f", "lavfi", "-i",
                    f"sine=frequency={frequency}:duration=0.6",
                    "-filter:a", "volume=1.8", "-ar", "48000", "-ac", "2",
                    str(path),
                ], check=True)
            scene = {
                "duration_ms": 1_000,
                "sequence_projection": {"duration_ms": 600, "spans": []},
                "tracks": [{
                    "id": "audio", "kind": "audio", "volume": 1,
                    "muted": False, "clips": [{
                        "filename": source.name, "gain": 1,
                        "resolved_start_ms": 0, "resolved_duration_ms": 600,
                        "source_offset_ms": 0, "fade_in_ms": 0,
                        "fade_out_ms": 0, "loop": False, "ducking": False,
                        "orphan": False, "missing": False,
                        "effects": [
                            {"type": "filter", "enabled": True,
                             "mode": "lowpass", "frequency_hz": 8_000, "q": .707},
                            {"type": "compressor", "enabled": True,
                             "threshold_db": -18, "ratio": 4, "attack_ms": 12,
                             "release_ms": 180, "makeup_db": 1},
                            {"type": "reverb", "enabled": True,
                             "room_size": .4, "mix": .15},
                            {"type": "distortion", "enabled": True,
                             "amount": .2, "mix": .15},
                            {"type": "pan", "enabled": True, "pan": .25},
                        ],
                    }],
                }],
            }

            with patch.object(render_workspace, "_output", return_value=root):
                self.assertTrue(render_workspace._mix_scene(sequence, scene, target))
            loudness = render_workspace._measure_loudness(target)

        self.assertIsNotNone(loudness)
        self.assertLessEqual(loudness["true_peak_dbtp"], -.8)
        self.assertTrue(math.isfinite(loudness["integrated_lufs"]))
        self.assertTrue(math.isfinite(loudness["loudness_range_lu"]))

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                         "FFmpeg is required for video-audio acceptance.")
    def test_real_ffmpeg_uses_embedded_video_audio_with_visual_timing(self):
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            sequence = root / "sequence.wav"
            video = root / "camera.mov"
            target = root / "mixed.mp3"
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-f", "lavfi", "-i", "sine=frequency=220:duration=2",
                "-filter:a", "volume=0", "-ar", "48000", "-ac", "2",
                str(sequence),
            ], check=True)
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-f", "lavfi", "-i", "color=size=320x180:rate=24:color=blue",
                "-f", "lavfi", "-i", "sine=frequency=880:duration=1",
                "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-c:a", "aac", str(video),
            ], check=True)
            scene = {
                "duration_ms": 2_000,
                "sequence_projection": {"duration_ms": 2_000, "spans": []},
                "tracks": [{
                    "id": "embedded-video-audio", "kind": "audio",
                    "volume": 1, "muted": False, "clips": [{
                        "filename": video.name, "source_media_type": "video",
                        "gain": 1, "resolved_start_ms": 200,
                        "resolved_duration_ms": 500, "source_offset_ms": 250,
                        "fade_in_ms": 0, "fade_out_ms": 0, "loop": False,
                        "ducking": False, "orphan": False, "missing": False,
                        "muted": False, "effects": [],
                    }],
                }],
            }

            with patch.object(render_workspace, "_output", return_value=root):
                self.assertTrue(render_workspace._mix_scene(sequence, scene, target))
            decoded = subprocess.run([
                "ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(target),
                "-f", "s16le", "-ac", "1", "-ar", "48000", "-",
            ], check=True, capture_output=True).stdout
            samples = struct.unpack(f"<{len(decoded) // 2}h", decoded)

        before = samples[:int(.15 * 48_000)]
        during = samples[int(.3 * 48_000):int(.6 * 48_000)]
        after = samples[int(.8 * 48_000):]
        self.assertLessEqual(max(map(abs, before), default=0), 8)
        self.assertGreater(max(map(abs, during), default=0), 100)
        self.assertLessEqual(max(map(abs, after), default=0), 8)

    def test_finished_export_manifest_records_master_safety_and_measurement(self):
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()

            def stem(_production_id, _parts, _signature):
                (root / "sequence.mp3").write_bytes(b"sequence")
                return {"filename": "sequence.mp3"}

            def mix(_sequence, _scene, target):
                target.write_bytes(b"master")
                return True

            measurement = {
                "integrated_lufs": -18.4,
                "true_peak_dbtp": -1.03,
                "loudness_range_lu": 4.2,
            }
            workspace = FFmpegRenderWorkspace()
            with (
                patch.object(render_workspace, "_output", return_value=root),
                patch.object(render_workspace, "_name", return_value="final.mp3"),
                patch.object(workspace, "sequence_stem", side_effect=stem),
                patch.object(render_workspace, "_mix_scene", side_effect=mix),
                patch.object(render_workspace, "_measure", return_value=1_000),
                patch.object(render_workspace, "_measure_loudness",
                             return_value=measurement),
            ):
                artifact = workspace.finish_export(
                    6, "Evening Reset", [], {
                        "signature": "scene",
                        "sequence_projection": {"signature": "sequence", "spans": []},
                        "tracks": [], "orphans": [],
                    }, {"srt": "", "vtt": ""},
                )

            self.assertEqual(artifact.manifest["output"]["peak_limiter_dbtp"], -1)
            self.assertEqual(artifact.manifest["output"]["loudness"], measurement)
            self.assertEqual(
                json.loads(artifact.manifest_path.read_text())["output"]["loudness"],
                measurement,
            )

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
                            "ducking": True, "duck_amount_db": -18,
                            "orphan": False,
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
        self.assertIn("[duckcompressin0][sequencedetector]sidechaincompress", filters)
        self.assertIn("[duckfloorin0]volume=0.125893", filters)
        self.assertIn("volume=0.874107[duckvariable0]", filters)
        self.assertIn("[under0][scene2]amix=inputs=2", filters)

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
        self.assertIn("aecho=0:1:250|500|750", filters)
        self.assertIn(":1.000000|0.500000|0.250000", filters)
        self.assertIn("adelay=0|0[sequencepart0]", filters)
        self.assertIn("atrim=duration=3.750", filters)

    def test_feedback_zero_renders_one_wet_hit_and_preserves_dry_wet_mix(self):
        filters: list[str] = []
        output = render_workspace._append_effects(filters, "[input]", [{
            "id": "echo", "type": "echo", "enabled": True,
            "delay_ms": 200, "feedback": 0, "mix": .25,
        }], "test")

        graph = ";".join(filters)
        self.assertEqual(output, "[testfx0]")
        self.assertIn("volume=0.750000[testdry0]", graph)
        self.assertIn("aecho=0:1:200:1.000000", graph)
        self.assertIn("volume=0.250000[testecho0]", graph)

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg is required")
    def test_echo_filter_matches_browser_dry_wet_signal_levels(self):
        """Measure the rendered impulse, not merely the generated filter text."""
        sample_rate = 48_000
        delay_ms = 100
        delay_sample = sample_rate * delay_ms // 1_000

        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            source = root / "impulse.wav"
            with wave.open(str(source), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(sample_rate)
                samples = [0] * sample_rate
                samples[0] = 16_000
                output.writeframes(struct.pack(f"<{len(samples)}h", *samples))

            def render(mix: float, feedback: float) -> list[int]:
                filters: list[str] = []
                rendered = render_workspace._append_effects(filters, "[0:a]", [{
                    "id": "echo", "type": "echo", "enabled": True,
                    "delay_ms": delay_ms, "feedback": feedback, "mix": mix,
                }], "signal")
                target = root / f"echo-{mix}-{feedback}.wav"
                command = [
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-i", str(source),
                ]
                if filters:
                    command.extend(["-filter_complex", ";".join(filters),
                                    "-map", rendered])
                command.extend(["-c:a", "pcm_s16le", str(target)])
                subprocess.run(command, check=True)
                with wave.open(str(target), "rb") as result:
                    frames = result.readframes(result.getnframes())
                return list(struct.unpack(f"<{len(frames) // 2}h", frames))

            dry = render(0, 0)
            quarter = render(.25, 0)
            wet = render(1, 0)
            repeated = render(1, .5)

        self.assertAlmostEqual(dry[0], 16_000, delta=2)
        self.assertAlmostEqual(dry[delay_sample], 0, delta=2)
        self.assertAlmostEqual(quarter[0], 12_000, delta=4)
        self.assertAlmostEqual(quarter[delay_sample], 4_000, delta=4)
        self.assertAlmostEqual(wet[0], 0, delta=2)
        self.assertAlmostEqual(wet[delay_sample], 16_000, delta=4)
        self.assertAlmostEqual(wet[delay_sample * 2], 0, delta=2)
        self.assertAlmostEqual(repeated[delay_sample], 16_000, delta=4)
        self.assertAlmostEqual(repeated[delay_sample * 2], 8_000, delta=4)

    def test_ducking_detector_uses_audible_pre_effect_sequence_mix(self):
        commands: list[list[str]] = []

        def run(command, **_kwargs):
            commands.append(command)
            Path(command[-1]).write_bytes(b"mixed")
            return type("Result", (), {"returncode": 0, "stderr": b""})()

        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            sequence = root / "sequence.mp3"
            music = root / "music.mp3"
            sequence.write_bytes(b"sequence")
            music.write_bytes(b"music")
            scene = {
                "duration_ms": 2_500,
                "sequence_projection": {
                    "duration_ms": 2_000,
                    "spans": [
                        {"start_ms": 0, "duration_ms": 1_000, "mix": {
                            "muted": True, "gain": 1, "fade_in_ms": 0,
                            "fade_out_ms": 0, "effects": [{
                                "id": "echo", "type": "echo", "enabled": True,
                                "delay_ms": 250, "feedback": 0, "mix": .5,
                            }],
                        }},
                        {"start_ms": 1_000, "duration_ms": 1_000, "mix": {
                            "muted": False, "gain": .8, "fade_in_ms": 0,
                            "fade_out_ms": 0, "effects": [],
                        }},
                    ],
                },
                "tracks": [{
                    "id": "music", "kind": "music", "volume": 1,
                    "muted": False, "clips": [{
                        "filename": "music.mp3", "gain": 1,
                        "resolved_start_ms": 0, "resolved_duration_ms": 2_000,
                        "source_offset_ms": 0, "fade_in_ms": 0,
                        "fade_out_ms": 0, "loop": False, "ducking": True,
                        "orphan": False, "missing": False, "effects": [],
                    }],
                }],
            }
            with (
                patch.object(render_workspace, "_output", return_value=root),
                patch.object(render_workspace.subprocess, "run", side_effect=run),
            ):
                self.assertTrue(render_workspace._mix_scene(
                    sequence, scene, root / "mixed.mp3"))

        graph = commands[0][commands[0].index("-filter_complex") + 1]
        self.assertIn("volume=0.0000", graph)
        self.assertIn("volume=0.8000", graph)
        self.assertIn(
            "[sequencepart0]asplit=2[sequenceeffectpart0][sequencedetectorpart0]",
            graph,
        )
        self.assertIn(
            "[sequencedetectorpart0][sequencedetectorpart1]amix=inputs=2",
            graph,
        )
        self.assertIn("[duckcompressin0][sequencedetector]sidechaincompress", graph)

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

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                         "FFmpeg is required for the render acceptance.")
    def test_real_ffmpeg_feedback_zero_keeps_first_delayed_echo(self):
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
                "duration_ms": 1_200,
                "sequence_projection": {
                    "duration_ms": 1_000,
                    "spans": [{
                        "start_ms": 0, "duration_ms": 1_000,
                        "mix": {
                            "muted": False, "gain": 1,
                            "fade_in_ms": 0, "fade_out_ms": 0,
                            "effects": [{
                                "id": "echo", "type": "echo",
                                "enabled": True, "delay_ms": 200,
                                "feedback": 0, "mix": .5,
                            }],
                        },
                    }],
                },
                "tracks": [],
            }

            self.assertTrue(render_workspace._mix_scene(sequence, scene, target))
            duration_ms = render_workspace._measure(target)
            self.assertGreaterEqual(duration_ms or 0, 1_150)
            self.assertLessEqual(duration_ms or 0, 1_300)

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
