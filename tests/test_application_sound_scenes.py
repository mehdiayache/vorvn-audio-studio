"""Sound Scene use-case tests without PostgreSQL, FFmpeg or providers."""

import unittest

from audio_studio.application.sound_scenes import SoundSceneService
from audio_studio.domain.sound_scene import empty_scene


class Records:
    def __init__(self):
        self.scene = {
            "production_id": 6, "revision": 1,
            "document": empty_scene(), "can_undo": False,
            "can_redo": False, "updated_at": "2026-08-18T00:00:00",
        }

    def get(self, production_id):
        return self.scene if production_id == 6 else None

    def commit(self, production_id, expected_revision, document,
               mutation_kind="operator"):
        if production_id != 6 or expected_revision != self.scene["revision"]:
            return None
        self.scene = {**self.scene, "revision": expected_revision + 1,
                      "document": document, "can_undo": True}
        return self.scene

    def step(self, production_id, direction):
        return self.scene if production_id == 6 else None


class Sequence:
    def __init__(self):
        self.items = [{
            "id": 7, "public_id": "part-7", "position": 0,
            "kind": "speech", "filename": "opening.mp3",
            "duration_ms": 4_000, "revision": 1, "clip_id": 41,
            "missing": False,
        }]

    def parts(self, _production_id):
        return self.items


class Workspace:
    def __init__(self):
        self.calls = []

    def sequence_stem(self, production_id, parts, signature):
        self.calls.append((production_id, parts, signature))
        return {"url": "/audio/stem.mp3", "filename": "stem.mp3",
                "duration_ms": 4_000, "signature": signature,
                "cached": len(self.calls) > 1}


class SoundSceneServiceTests(unittest.TestCase):
    def setUp(self):
        self.records = Records()
        self.sequence = Sequence()
        self.workspace = Workspace()
        self.service = SoundSceneService(
            self.records, self.sequence, self.workspace)

    def test_sequence_stem_key_changes_with_canonical_sequence_truth(self):
        initial = self.service.get(6)
        initial_signature = initial["sequence_stem"]["signature"]
        self.sequence.items.insert(0, {
            "id": 5, "public_id": "part-5", "position": 0,
            "kind": "silence", "duration_ms": 2_000, "title": "2",
            "revision": 1, "missing": False,
        })
        inserted = self.service.get(6)
        self.assertNotEqual(
            initial_signature, inserted["sequence_stem"]["signature"])
        self.assertEqual(
            inserted["resolved"]["sequence_projection"]["spans"][1]["start_ms"],
            2_000,
        )

        self.sequence.items[1] = {
            **self.sequence.items[1], "duration_ms": 7_000,
            "clip_id": 99, "revision": 2,
        }
        rerecorded = self.service.get(6)
        self.assertNotEqual(
            inserted["sequence_stem"]["signature"],
            rerecorded["sequence_stem"]["signature"],
        )

    def test_missing_voice_audio_keeps_scene_readable_without_bad_stem(self):
        self.sequence.items[0] = {
            **self.sequence.items[0], "filename": "", "missing": True,
        }
        response = self.service.get(6)
        self.assertEqual(response["sequence_stem"]["url"], "")
        self.assertIn("unavailable", response["sequence_stem"]["unavailable_reason"].lower())
        self.assertEqual(self.workspace.calls, [])


if __name__ == "__main__":
    unittest.main()
