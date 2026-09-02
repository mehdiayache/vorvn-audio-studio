"""Filesystem rollback checks for the Project render workspace."""

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

from origins.infrastructure import render_workspace
from origins.infrastructure.render_workspace import FFmpegRenderWorkspace


class RenderWorkspaceTests(unittest.TestCase):
    def test_video_duration_uses_the_furthest_sound_or_visual_endpoint(self):
        scene = {"duration_ms": 8_000, "sequence_projection": {"duration_ms": 6_000}}
        visual = {"document": {"tracks": [{"clips": [
            {"start_ms": 7_000, "duration_ms": 5_000},
        ]}]}}
        self.assertEqual(
            render_workspace._project_timeline_duration_ms(scene, visual),
            12_000,
        )

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                         "FFmpeg is required for MP4 acceptance.")
    def test_real_mp4_composes_visual_timing_and_finished_audio(self):
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            image = root / "cover.png"
            video = root / "motion.mp4"
            audio = root / "master.mp3"
            target = root / "result.mp4"
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-f", "lavfi", "-i", "color=c=red:s=640x360:d=1",
                "-frames:v", "1", str(image),
            ], check=True)
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1",
                "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                str(video),
            ], check=True)
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-f", "lavfi", "-i", "sine=frequency=220:duration=2",
                "-ar", "48000", "-ac", "2", str(audio),
            ], check=True)
            scene = {
                "document": {
                    "canvas": {"width": 640, "height": 360},
                    "tracks": [
                        {"id": "image", "media_type": "image",
                         "visible": True, "clips": [{
                             "file_id": 1, "start_ms": 0,
                             "duration_ms": 1000, "source_offset_ms": 0,
                             "fit": "contain", "position_x": 100,
                             "position_y": 50, "scale": .5,
                             "opacity": .5}]},
                        {"id": "video", "media_type": "video",
                         "visible": True, "clips": [{
                             "file_id": 2, "start_ms": 1000,
                             "duration_ms": 1000, "source_offset_ms": 0,
                             "fit": "cover"}]},
                    ],
                },
                "sources": {
                    "1": {"media_type": "image", "filename": image.name},
                    "2": {"media_type": "video", "filename": video.name},
                },
            }
            with patch.object(render_workspace, "_output", return_value=root):
                render_workspace._render_visual_scene(
                    scene, audio, target, duration_ms=2000)
            result = subprocess.run([
                "ffprobe", "-v", "error", "-show_entries",
                "stream=codec_type,codec_name,width,height", "-show_entries",
                "format=duration", "-of", "json", str(target),
            ], check=True, capture_output=True, text=True)
            report = json.loads(result.stdout)
            def sample_pixel(x: int, y: int) -> tuple[int, int, int]:
                sampled = subprocess.run([
                    "ffmpeg", "-v", "error", "-ss", "0.5", "-i",
                    str(target), "-vf", f"crop=2:2:{x}:{y}", "-frames:v", "1",
                    "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
                ], check=True, capture_output=True).stdout
                return tuple(sampled[:3])
            background = sample_pixel(20, 20)
            old_top_left_origin = sample_pixel(150, 100)
            transformed = sample_pixel(320, 180)

        streams = {stream["codec_type"]: stream for stream in report["streams"]}
        self.assertEqual(streams["video"]["codec_name"], "h264")
        self.assertEqual(
            (streams["video"]["width"], streams["video"]["height"]),
            (640, 360),
        )
        self.assertEqual(streams["audio"]["codec_name"], "aac")
        self.assertAlmostEqual(float(report["format"]["duration"]), 2, places=2)
        self.assertLess(max(background), 30)
        self.assertLess(max(old_top_left_origin), 30)
        self.assertGreater(transformed[0], 80)
        self.assertLess(transformed[0], 180)
        self.assertLess(max(transformed[1:]), 35)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                         "FFmpeg is required for MP4 acceptance.")
    def test_portrait_fit_and_fill_have_distinct_export_geometry(self):
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            portrait = root / "portrait.png"
            audio = root / "master.wav"
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-f", "lavfi", "-i", "color=c=red:s=180x360:d=1",
                "-frames:v", "1", str(portrait),
            ], check=True)
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
                "-t", "1", str(audio),
            ], check=True)

            def render(fit: str) -> Path:
                target = root / f"{fit}.mp4"
                scene = {
                    "document": {
                        "canvas": {"width": 640, "height": 360},
                        "tracks": [{
                            "id": "portrait", "media_type": "image",
                            "visible": True, "clips": [{
                                "file_id": 1, "start_ms": 0,
                                "duration_ms": 1000, "source_offset_ms": 0,
                                "fit": fit, "position_x": 0,
                                "position_y": 0, "scale": 1,
                                "opacity": 1,
                            }],
                        }],
                    },
                    "sources": {
                        "1": {"media_type": "image",
                              "filename": portrait.name},
                    },
                }
                with patch.object(render_workspace, "_output", return_value=root):
                    render_workspace._render_visual_scene(
                        scene, audio, target, duration_ms=1000)
                return target

            def pixel(path: Path, x: int, y: int) -> tuple[int, int, int]:
                result = subprocess.run([
                    "ffmpeg", "-v", "error", "-ss", "0.1", "-i", str(path),
                    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
                ], capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr.decode())
                sampled = result.stdout
                offset = ((y * 640) + x) * 3
                return tuple(sampled[offset:offset + 3])

            contained_edge = pixel(render("contain"), 20, 178)
            covered_edge = pixel(render("cover"), 20, 178)

        self.assertLess(max(contained_edge), 30)
        self.assertGreater(covered_edge[0], 180)
        self.assertLess(max(covered_edge[1:]), 40)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                         "FFmpeg is required for MP4 acceptance.")
    def test_real_mp4_applies_flip_and_rotation_to_the_same_source_geometry(self):
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            source = root / "corner.png"
            audio = root / "master.wav"
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-f", "lavfi", "-i",
                "color=c=black:s=320x320:d=1,"
                "drawbox=x=0:y=0:w=80:h=80:color=red:t=fill",
                "-frames:v", "1", str(source),
            ], check=True)
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
                "-t", "1", str(audio),
            ], check=True)

            def render(name: str, **transform) -> Path:
                target = root / f"{name}.mp4"
                clip = {
                    "file_id": 1, "start_ms": 0, "duration_ms": 1000,
                    "source_offset_ms": 0, "fit": "cover",
                    "position_x": 0, "position_y": 0, "scale": 1,
                    "rotation_degrees": 0, "flip_horizontal": False,
                    "flip_vertical": False, "opacity": 1,
                    **transform,
                }
                scene = {
                    "document": {
                        "canvas": {"width": 320, "height": 320},
                        "tracks": [{
                            "id": "image", "media_type": "image",
                            "visible": True, "clips": [clip],
                        }],
                    },
                    "sources": {
                        "1": {"media_type": "image",
                              "filename": source.name},
                    },
                }
                with patch.object(render_workspace, "_output", return_value=root):
                    render_workspace._render_visual_scene(
                        scene, audio, target, duration_ms=1000)
                return target

            def pixel(path: Path, x: int, y: int) -> tuple[int, int, int]:
                sampled = subprocess.run([
                    "ffmpeg", "-v", "error", "-ss", "0.1", "-i",
                    str(path), "-vf", f"crop=2:2:{x}:{y}",
                    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt",
                    "rgb24", "-",
                ], check=True, capture_output=True).stdout
                return tuple(sampled[:3])

            flipped = render("flipped", flip_horizontal=True)
            rotated = render("rotated", rotation_degrees=180)
            flipped_left = pixel(flipped, 20, 20)
            flipped_right = pixel(flipped, 300, 20)
            rotated_top_left = pixel(rotated, 20, 20)
            rotated_bottom_right = pixel(rotated, 300, 300)

        self.assertLess(max(flipped_left), 30)
        self.assertGreater(flipped_right[0], 180)
        self.assertLess(max(flipped_right[1:]), 40)
        self.assertLess(max(rotated_top_left), 30)
        self.assertGreater(rotated_bottom_right[0], 180)
        self.assertLess(max(rotated_bottom_right[1:]), 40)

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

            def stem(_project_id, _parts, _signature):
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
                patch.object(render_workspace, "_name", return_value="final.mp3") as make_name,
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

            make_name.assert_called_once_with("vrn-Evening Reset")
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
        self.assertIn("atrim=end_sample=180000", filters)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                         "FFmpeg is required for the render acceptance.")
    def test_real_ffmpeg_final_master_keeps_all_sequence_parts_with_music(self):
        """The master clock must not stop at the first delayed Part boundary."""
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            sequence = root / "sequence.wav"
            music = root / "music.wav"
            target = root / "mixed.mp3"
            for source, frequency in ((sequence, 440), (music, 220)):
                subprocess.run([
                    "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                    "-f", "lavfi", "-i",
                    f"sine=frequency={frequency}:duration=4",
                    "-ar", "48000", "-ac", "2", str(source),
                ], check=True)
            scene = {
                "duration_ms": 4_000,
                "sequence_projection": {
                    "duration_ms": 4_000,
                    "spans": [
                        {
                            "start_ms": 0, "duration_ms": 1_000,
                            "mix": {
                                "muted": False, "gain": .9,
                                "fade_in_ms": 0, "fade_out_ms": 0,
                                "effects": [],
                            },
                        },
                        {
                            "start_ms": 1_000, "duration_ms": 3_000,
                            "mix": {
                                "muted": False, "gain": .8,
                                "fade_in_ms": 0, "fade_out_ms": 0,
                                "effects": [],
                            },
                        },
                    ],
                },
                "tracks": [{
                    "id": "music", "kind": "music", "volume": 1,
                    "muted": False,
                    "clips": [{
                        "filename": music.name, "gain": .2,
                        "resolved_start_ms": 0,
                        "resolved_duration_ms": 4_000,
                        "source_offset_ms": 0,
                        "fade_in_ms": 0, "fade_out_ms": 0,
                        "loop": False, "ducking": False,
                        "orphan": False, "missing": False,
                        "effects": [],
                    }],
                }],
            }

            with patch.object(render_workspace, "_output", return_value=root):
                self.assertTrue(render_workspace._mix_scene(
                    sequence, scene, target))

            duration_ms = render_workspace._measure(target)
            self.assertGreaterEqual(duration_ms or 0, 3_950)
            self.assertLessEqual(duration_ms or 0, 4_050)

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
                patch("origins.infrastructure.render_workspace._output",
                      return_value=root),
                patch("origins.infrastructure.render_workspace._name",
                      return_value="final.mp3"),
                patch("origins.infrastructure.render_workspace._sequence",
                      side_effect=sequence),
                patch("origins.infrastructure.render_workspace._mix_scene",
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
