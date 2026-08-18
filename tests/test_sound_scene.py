"""Provider-free Sound Scene projection and anchor contracts."""

from copy import deepcopy
import unittest

from audio_studio.domain.sound_scene import empty_scene, resolve_scene, voice_projection


def speech(part_id: int, duration_ms: int, position: int) -> dict:
    return {
        "id": part_id, "public_id": f"part-{part_id}", "position": position,
        "kind": "speech", "filename": f"part-{part_id}.mp3",
        "duration_ms": duration_ms, "revision": 1, "clip_id": part_id * 10,
        "authored_role": "Narrator", "missing": False,
    }


def anchored_scene(part_id: int) -> dict:
    scene = empty_scene()
    scene["tracks"][0]["clips"] = [{
        "id": "78af885c-aeb4-49bf-9edb-d3fc14496b2c",
        "asset_id": 9, "asset_version_id": 11,
        "start_ms": 0, "duration_ms": 2_000, "source_offset_ms": 250,
        "gain": .2, "fade_in_ms": 200, "fade_out_ms": 300,
        "loop": False, "ducking": True,
        "anchor": {"kind": "part", "part_id": part_id,
                   "edge": "start", "offset_ms": 500},
        "asset_name": "Future transition", "filename": "transition.wav",
        "source_duration_ms": 10_000, "missing": False,
    }]
    return scene


class SoundSceneDomainTests(unittest.TestCase):
    def test_voice_projection_follows_insert_reorder_and_rerecord_duration(self):
        first = speech(1, 4_000, 0)
        later = speech(2, 6_000, 1)
        initial = voice_projection([first, later])
        self.assertEqual(
            [(span["part_id"], span["start_ms"]) for span in initial["spans"]],
            [(1, 0), (2, 4_000)],
        )

        inserted = speech(3, 2_000, 1)
        after_insert = voice_projection([first, inserted, later])
        self.assertEqual(after_insert["spans"][2]["start_ms"], 6_000)

        rerecorded = {**first, "duration_ms": 7_000, "clip_id": 99}
        after_record = voice_projection([rerecorded, inserted, later])
        self.assertEqual(after_record["spans"][2]["start_ms"], 9_000)
        self.assertNotEqual(initial["signature"], after_record["signature"])

    def test_part_anchor_follows_sequence_changes_without_mutating_document(self):
        original = anchored_scene(2)
        before = deepcopy(original)
        first = speech(1, 4_000, 0)
        target = speech(2, 6_000, 1)
        initial = resolve_scene(original, [first, target])
        self.assertEqual(
            initial["tracks"][0]["clips"][0]["resolved_start_ms"], 4_500)

        inserted = speech(3, 2_000, 1)
        moved = resolve_scene(original, [first, inserted, target])
        self.assertEqual(
            moved["tracks"][0]["clips"][0]["resolved_start_ms"], 6_500)
        self.assertEqual(original, before)

    def test_deleted_anchor_is_an_explicit_orphan(self):
        resolved = resolve_scene(anchored_scene(2), [speech(1, 4_000, 0)])
        clip = resolved["tracks"][0]["clips"][0]
        self.assertTrue(clip["orphan"])
        self.assertIsNone(clip["resolved_start_ms"])
        self.assertEqual(clip["resolved_duration_ms"], 0)
        self.assertEqual(resolved["orphans"], [{
            "track_id": "music",
            "clip_id": "78af885c-aeb4-49bf-9edb-d3fc14496b2c",
            "reason": "anchor_part_missing",
        }])

    def test_follow_duration_tracks_current_production_length(self):
        scene = empty_scene()
        scene["tracks"][0]["clips"] = [{
            "id": "78af885c-aeb4-49bf-9edb-d3fc14496b2c",
            "asset_id": 9, "start_ms": 0, "duration_ms": None,
            "source_offset_ms": 0, "gain": .1, "fade_in_ms": 0,
            "fade_out_ms": 0, "loop": True, "ducking": True,
            "anchor": {"kind": "absolute", "position_ms": 0},
        }]
        first = resolve_scene(scene, [speech(1, 4_000, 0)])
        longer = resolve_scene(scene, [speech(1, 9_000, 0)])
        self.assertEqual(first["tracks"][0]["clips"][0]["resolved_duration_ms"], 4_000)
        self.assertEqual(longer["tracks"][0]["clips"][0]["resolved_duration_ms"], 9_000)


if __name__ == "__main__":
    unittest.main()
