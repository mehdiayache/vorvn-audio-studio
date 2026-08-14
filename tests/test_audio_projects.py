"""Lean Project -> Tracks -> Clips rendering contracts."""

from __future__ import annotations

import math
from pathlib import Path
import struct
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from audio_studio.application.audio_projects import production_scene
from audio_studio.http.app import app
from audio_studio.infrastructure.audio_codec import pcm_wav
from audio_studio.infrastructure.audio_peaks import peaks
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
                 "position": 1, "enabled": True, "title": "0.5"},
                {"id": 3, "kind": "draft", "position": 2,
                 "enabled": True},
                {"id": 4, "kind": "speech", "position": 3,
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
        ])

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
            self.assertTrue(all(.08 <= value <= 1 for value in first))
            self.assertTrue((root / ".voice.wav.peaks-24.json").is_file())

    def test_openapi_exposes_headless_render_and_peaks(self):
        paths = app.openapi()["paths"]
        self.assertIn("post", paths["/api/v1/projects/render"])
        self.assertIn("get", paths["/api/v1/productions/{production_id}/project-scene"])
        self.assertIn("get", paths["/api/v1/media/peaks/{name}"])


if __name__ == "__main__":
    unittest.main()
