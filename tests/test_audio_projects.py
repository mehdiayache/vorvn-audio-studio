"""Lean Project -> Tracks -> Clips rendering contracts."""

from __future__ import annotations

import math
from pathlib import Path
import struct
from tempfile import TemporaryDirectory
from concurrent.futures import ThreadPoolExecutor
import unittest
from unittest.mock import patch

from audio_studio.application.audio_projects import production_scene
from audio_studio.http.app import app
from audio_studio.infrastructure.audio_codec import pcm_wav
from audio_studio.infrastructure.audio_peaks import _write_cache, peaks
from audio_studio.infrastructure.render_workspace import FFmpegRenderWorkspace


def _tone(seconds: float = .2, *, rate: int = 24_000) -> bytes:
    samples = (
        round(math.sin(2 * math.pi * 440 * index / rate) * 12_000)
        for index in range(round(seconds * rate))
    )
    return pcm_wav(b"".join(struct.pack("<h", sample) for sample in samples),
                   sample_rate=rate)


class AudioProjectTests(unittest.TestCase):
    def test_production_serializes_to_tracks_and_simple_clips(self):
        scene = production_scene({
            "id": 6,
            "public_id": "production-6",
            "name": "Conversation",
            "parts": [
                {"id": 1, "public_id": "part-1", "kind": "speech",
                 "position": 0, "enabled": True, "duration_ms": 800,
                 "filename": "one.wav"},
                {"id": 2, "public_id": "part-2", "kind": "silence",
                 "position": 1, "enabled": True, "title": "9",
                 "duration_ms": 500},
                {"id": 3, "kind": "draft", "position": 2,
                 "enabled": True},
                {"id": 4, "public_id": "future-pause", "kind": "silence",
                 "position": 3, "enabled": True, "duration_ms": 700},
                {"id": 5, "kind": "speech", "position": 4,
                 "enabled": False},
            ],
        }, {})
        self.assertEqual(scene["sample_rate"], 48_000)
        self.assertEqual(len(scene["tracks"]), 1)
        self.assertEqual(scene["tracks"][0]["clips"], [
            {"id": "part-1", "start_time": 0.0, "duration": .8,
             "file_url": "/audio/one.wav"},
            {"id": "part-2", "start_time": .8, "duration": .5,
             "file_url": "silence://2"},
            {"id": "future-pause", "start_time": 1.3, "duration": .7,
             "file_url": "silence://4"},
        ])

    def test_legacy_silence_uses_title_only_without_duration_ms(self):
        scene = production_scene({
            "id": 6,
            "parts": [{
                "id": 2, "kind": "silence", "enabled": True,
                "title": "0.75",
            }],
        }, {})
        self.assertEqual(scene["tracks"][0]["clips"][0]["duration"], .75)

    def test_project_render_is_normalized_and_cached(self):
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / "voice.wav").write_bytes(_tone())
            project = {
                "name": "Two Clips",
                "sample_rate": 48_000,
                "tracks": [{
                    "id": "dialogue", "kind": "dialogue", "volume": 1,
                    "loop": False, "source_offset": 0,
                    "clips": [
                        {"id": "a", "start_time": 0, "duration": .2,
                         "file_url": "/audio/voice.wav"},
                        {"id": "b", "start_time": .25, "duration": .1,
                         "file_url": "silence://b"},
                    ],
                }],
            }
            with patch("audio_studio.infrastructure.render_workspace._output",
                       return_value=root):
                first = FFmpegRenderWorkspace().render_project(project)
                second = FFmpegRenderWorkspace().render_project(project)
            self.assertFalse(first["cached"])
            self.assertTrue(second["cached"])
            self.assertEqual((first["sample_rate"], first["channels"]),
                             (48_000, 2))
            self.assertGreater(first["duration_ms"] or 0, 250)
            self.assertTrue((root / first["name"]).is_file())

    def test_server_waveform_peaks_are_bounded_and_cached(self):
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / "voice.wav").write_bytes(_tone())
            with patch("audio_studio.infrastructure.audio_peaks.media_root",
                       return_value=root):
                first = peaks("voice.wav", 24)
                second = peaks("voice.wav", 24)
            self.assertEqual(first, second)
            self.assertEqual(len(first), 24)
            self.assertTrue(all(0 <= value <= 1 for value in first))
            self.assertTrue((root / ".voice.wav.peaks-v2-24.json").is_file())
            self.assertTrue((root / ".voice.wav.peaks-v2-4096.json").is_file())

    def test_server_waveform_peaks_reuses_one_canonical_decode(self):
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / "voice.wav").write_bytes(_tone())
            with patch("audio_studio.infrastructure.audio_peaks.media_root",
                       return_value=root), patch(
                           "audio_studio.infrastructure.audio_peaks.subprocess.run",
                           wraps=__import__("subprocess").run) as decode:
                peaks("voice.wav", 128)
                peaks("voice.wav", 2048)
            self.assertEqual(decode.call_count, 1)

    def test_server_waveform_peaks_supports_timeline_resolution(self):
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / "voice.wav").write_bytes(_tone())
            with patch("audio_studio.infrastructure.audio_peaks.media_root",
                       return_value=root):
                values = peaks("voice.wav", 4096)
            self.assertEqual(len(values), 4096)

    def test_waveform_cache_writes_are_atomic_under_concurrency(self):
        with TemporaryDirectory() as folder:
            target = Path(folder) / ".voice.wav.peaks-v2-4096.json"
            candidates = [[float(index)] * 32 for index in range(16)]
            with ThreadPoolExecutor(max_workers=8) as pool:
                list(pool.map(lambda values: _write_cache(target, values),
                              candidates))
            self.assertIn(__import__("json").loads(target.read_text()),
                          candidates)
            self.assertEqual(list(target.parent.glob("*.tmp")), [])

    def test_openapi_exposes_headless_render_and_peaks(self):
        paths = app.openapi()["paths"]
        self.assertIn("post", paths["/api/v1/projects/render"])
        self.assertIn("get", paths["/api/v1/productions/{production_id}/project-scene"])
        self.assertIn("get", paths["/api/v1/media/peaks/{name}"])
        bars = paths["/api/v1/media/peaks/{name}"]["get"]["parameters"][1]["schema"]
        self.assertEqual(bars["maximum"], 4096)


if __name__ == "__main__":
    unittest.main()
