"""Provider-free Sound Scene projection and anchor contracts."""

from copy import deepcopy
import unittest

from audio_studio.domain.sound_scene import (
    SoundSceneError,
    effect_tail_ms,
    empty_scene,
    merge_linked_visual_audio,
    normalize_scene,
    resolve_scene,
    sequence_projection,
)


def speech(part_id: int, duration_ms: int, position: int) -> dict:
    return {
        "id": part_id,
        "public_id": f"00000000-0000-0000-0000-{part_id:012d}",
        "position": position,
        "kind": "speech", "filename": f"part-{part_id}.mp3",
        "duration_ms": duration_ms, "revision": 1, "clip_id": part_id * 10,
        "authored_role": "Narrator", "missing": False,
    }


def anchored_scene(part_public_id: str) -> dict:
    scene = empty_scene()
    scene["tracks"].append({
        "id": "music", "kind": "music", "name": "Music",
        "volume": 1, "muted": False, "clips": [{
        "id": "78af885c-aeb4-49bf-9edb-d3fc14496b2c",
        "asset_id": 9, "asset_version_id": 11,
        "start_ms": 0, "duration_ms": 2_000, "source_offset_ms": 250,
        "gain": .2, "fade_in_ms": 200, "fade_out_ms": 300,
        "loop": False, "ducking": True,
        "anchor": {"kind": "part", "part_public_id": part_public_id,
                   "edge": "start", "offset_ms": 500},
        "asset_name": "Future transition", "filename": "transition.wav",
        "source_duration_ms": 10_000, "missing": False,
        }],
    })
    return scene


class SoundSceneDomainTests(unittest.TestCase):
    def test_visual_audio_projection_updates_timing_without_rewriting_mix(self):
        linked_id = "10000000-0000-4000-8000-000000000001"
        clip_id = "20000000-0000-4000-8000-000000000001"
        history = empty_scene()
        history["tracks"] = [{
            "id": "embedded-video-audio", "kind": "audio",
            "name": "Video audio", "volume": .7, "muted": False,
            "clips": [{
                "id": clip_id, "linked_visual_clip_id": linked_id,
                "asset_id": 8, "duration_ms": 2_000,
                "source_offset_ms": 100, "gain": .35,
                "muted": True, "effects": [],
                "anchor": {"kind": "absolute", "position_ms": 500},
            }],
        }]
        projection = deepcopy(history)
        projected = projection["tracks"][0]["clips"][0]
        projected.update({
            "duration_ms": 4_000, "source_offset_ms": 900,
            "gain": 1, "muted": False,
            "anchor": {"kind": "absolute", "position_ms": 7_000},
        })

        merged = merge_linked_visual_audio(history, projection)
        clip = merged["tracks"][0]["clips"][0]
        self.assertEqual(
            (clip["duration_ms"], clip["source_offset_ms"],
             clip["anchor"]["position_ms"]),
            (4_000, 900, 7_000),
        )
        self.assertEqual((clip["gain"], clip["muted"]), (.35, True))

    def test_effect_primitives_normalize_to_one_bounded_canonical_chain(self):
        effect_id = lambda suffix: f"00000000-0000-0000-0000-{suffix:012d}"
        scene = empty_scene()
        scene["sequence_overrides"][speech(1, 1_000, 0)["public_id"]] = {
            "effects": [
                {"id": effect_id(1), "type": "filter", "enabled": True,
                 "mode": "highpass", "frequency_hz": 9, "q": 99},
                {"id": effect_id(2), "type": "compressor", "enabled": True,
                 "threshold_db": -99, "ratio": 99, "attack_ms": 0,
                 "release_ms": 9_999, "makeup_db": 99},
                {"id": effect_id(3), "type": "reverb", "enabled": True,
                 "room_size": 2, "mix": -.5},
                {"id": effect_id(4), "type": "distortion", "enabled": True,
                 "amount": 2, "mix": 2},
                {"id": effect_id(5), "type": "pan", "enabled": True,
                 "pan": -2},
            ],
        }

        effects = normalize_scene(scene)["sequence_overrides"][
            speech(1, 1_000, 0)["public_id"]]["effects"]

        self.assertEqual(effects[0], {
            "id": effect_id(1), "type": "filter", "enabled": True,
            "mode": "highpass", "frequency_hz": 40, "q": 18,
        })
        self.assertEqual(effects[1]["threshold_db"], -60)
        self.assertEqual(effects[1]["ratio"], 20)
        self.assertEqual(effects[1]["attack_ms"], .1)
        self.assertEqual(effects[1]["release_ms"], 3_000)
        self.assertEqual(effects[1]["makeup_db"], 24)
        self.assertEqual(effects[2]["room_size"], 1)
        self.assertEqual(effects[2]["mix"], 0)
        self.assertEqual(effects[3]["amount"], 1)
        self.assertEqual(effects[3]["mix"], 1)
        self.assertEqual(effects[4]["pan"], -1)
        self.assertEqual(effect_tail_ms(effects), 0)
        effects[2]["mix"] = .2
        self.assertEqual(effect_tail_ms(effects), 415)

    def test_legacy_ducking_defaults_to_minus_twelve_db(self):
        document = normalize_scene({
            "version": 1, "sequence_overrides": {}, "tracks": [{
                "id": "music", "kind": "audio", "name": "Music",
                "volume": 1, "muted": False, "clips": [{
                    "id": "78af885c-aeb4-49bf-9edb-d3fc14496b2c",
                    "asset_id": 9, "duration_ms": 1000,
                    "source_offset_ms": 0, "gain": 1, "fade_in_ms": 0,
                    "fade_out_ms": 0, "loop": False, "ducking": True,
                    "muted": False, "locked": False, "effects": [],
                    "anchor": {"kind": "absolute", "position_ms": 0},
                }],
            }],
        })
        self.assertEqual(
            document["tracks"][0]["clips"][0]["duck_amount_db"], -12)

    def test_echo_feedback_zero_keeps_exactly_one_delayed_hit(self):
        effect = {
            "id": "2bc326ca-57ba-4e63-bdfd-6145dfb73181",
            "type": "echo", "enabled": True, "delay_ms": 240,
            "feedback": 0, "mix": .4,
        }

        self.assertEqual(effect_tail_ms([effect]), 240)
        effect["mix"] = 0
        self.assertEqual(effect_tail_ms([effect]), 0)

    def test_effect_chain_rejects_duplicate_effect_types(self):
        scene = empty_scene()
        scene["sequence_overrides"][speech(1, 1_000, 0)["public_id"]] = {
            "effects": [
                {"id": "2bc326ca-57ba-4e63-bdfd-6145dfb73181",
                 "type": "telephone", "enabled": True},
                {"id": "3bc326ca-57ba-4e63-bdfd-6145dfb73181",
                 "type": "telephone", "enabled": True},
            ],
        }

        with self.assertRaisesRegex(SoundSceneError, "only one telephone"):
            normalize_scene(scene)

    def test_historical_v1_normalizes_to_one_canonical_document(self):
        historical = {
            "version": 1,
            "tracks": [{
                "id": "music", "kind": "music", "name": "Music",
                "volume": 1, "muted": False, "clips": [{
                    "id": "78af885c-aeb4-49bf-9edb-d3fc14496b2c",
                    "asset_id": 9, "start_ms": 2_500,
                    "duration_ms": 2_000, "source_offset_ms": 250,
                    "gain": .2, "fade_in_ms": 200,
                    "fade_out_ms": 300, "loop": False,
                    "ducking": True,
                }],
            }],
        }

        canonical = normalize_scene(historical)

        self.assertEqual(canonical["sequence_overrides"], {})
        self.assertEqual(canonical["tracks"][0]["kind"], "audio")
        self.assertEqual(canonical["tracks"][0]["name"], "Music")
        clip = canonical["tracks"][0]["clips"][0]
        self.assertNotIn("start_ms", clip)
        self.assertEqual(clip["anchor"], {
            "kind": "absolute", "position_ms": 2_500,
        })
        self.assertFalse(clip["muted"])
        self.assertFalse(clip["locked"])
        self.assertEqual(clip["effects"], [])
        self.assertEqual(normalize_scene(canonical), canonical)

    def test_sequence_override_is_resolved_without_changing_canonical_time(self):
        part = speech(1, 4_000, 0)
        scene = empty_scene()
        scene["sequence_overrides"][part["public_id"]] = {
            "muted": True, "gain": .82,
            "fade_in_ms": 5_000, "fade_out_ms": 900,
            "effects": [{
                "id": "2bc326ca-57ba-4e63-bdfd-6145dfb73181",
                "type": "echo", "enabled": True, "delay_ms": 250,
                "feedback": .35, "mix": .2,
            }],
        }

        resolved = resolve_scene(scene, [part])

        self.assertEqual(resolved["sequence_projection"]["duration_ms"], 4_000)
        mix = resolved["sequence_projection"]["spans"][0]["mix"]
        self.assertTrue(mix["muted"])
        self.assertEqual(mix["gain"], .82)
        self.assertEqual(mix["fade_in_ms"], 4_000)
        self.assertEqual(mix["fade_out_ms"], 900)
        self.assertEqual(mix["effects"][0]["type"], "echo")

    def test_echo_tail_overlaps_later_parts_and_only_extends_scene_end(self):
        first = speech(1, 2_000, 0)
        second = speech(2, 3_000, 1)
        scene = empty_scene()
        scene["sequence_overrides"][first["public_id"]] = {
            "muted": False, "gain": 1, "fade_in_ms": 0,
            "fade_out_ms": 0, "effects": [{
                "id": "2bc326ca-57ba-4e63-bdfd-6145dfb73181",
                "type": "echo", "enabled": True, "delay_ms": 250,
                "feedback": .5, "mix": .3,
            }],
        }

        resolved = resolve_scene(scene, [first, second])
        spans = resolved["sequence_projection"]["spans"]

        self.assertEqual(spans[1]["start_ms"], 2_000)
        self.assertGreater(spans[0]["effect_tail_ms"], 0)
        self.assertEqual(resolved["duration_ms"], 5_000)

        scene["sequence_overrides"] = {
            second["public_id"]: scene["sequence_overrides"][first["public_id"]]
        }
        final_echo = resolve_scene(scene, [first, second])
        final_span = final_echo["sequence_projection"]["spans"][1]
        self.assertEqual(
            final_echo["duration_ms"],
            5_000 + final_span["effect_tail_ms"],
        )

    def test_muted_clip_effect_tail_does_not_extend_scene(self):
        part = speech(1, 2_000, 0)
        scene = anchored_scene(part["public_id"])
        clip = scene["tracks"][0]["clips"][0]
        clip["muted"] = True
        clip["effects"] = [{
            "id": "2bc326ca-57ba-4e63-bdfd-6145dfb73181",
            "type": "echo", "enabled": True, "delay_ms": 500,
            "feedback": .5, "mix": .3,
        }]

        resolved = resolve_scene(scene, [part])

        self.assertGreater(
            resolved["tracks"][0]["clips"][0]["effect_tail_ms"], 0)
        self.assertEqual(resolved["duration_ms"], 2_000)

    def test_missing_sequence_override_is_an_explicit_obsolete_orphan(self):
        scene = empty_scene()
        missing = "00000000-0000-0000-0000-000000000099"
        scene["sequence_overrides"][missing] = {
            "muted": True, "gain": 1, "fade_in_ms": 0,
            "fade_out_ms": 0, "effects": [],
        }

        resolved = resolve_scene(scene, [speech(1, 4_000, 0)])

        self.assertEqual(resolved["orphans"], [{
            "kind": "sequence_override",
            "part_public_id": missing,
            "reason": "override_part_missing",
        }])

    def test_draft_is_absent_but_every_canonical_silence_keeps_its_time(self):
        before = speech(1, 4_000, 0)
        first_pause = {
            "id": 10, "public_id": "00000000-0000-0000-0000-000000000010",
            "position": 1, "kind": "silence", "duration_ms": 1_000,
        }
        draft = {
            "id": 11, "public_id": "00000000-0000-0000-0000-000000000011",
            "position": 2, "kind": "draft", "duration_ms": 0,
        }
        future_pause = {
            "id": 12, "public_id": "00000000-0000-0000-0000-000000000012",
            "position": 3, "kind": "silence", "duration_ms": 1_500,
        }
        second_future_pause = {
            "id": 13, "public_id": "00000000-0000-0000-0000-000000000013",
            "position": 4, "kind": "silence", "duration_ms": 750,
        }
        after = speech(2, 3_000, 5)

        projection = sequence_projection([
            before, first_pause, draft, future_pause, second_future_pause,
            after,
        ])

        self.assertEqual(
            [span["part_id"] for span in projection["spans"]],
            [1, 10, 12, 13, 2],
        )
        self.assertEqual(projection["duration_ms"], 10_250)
        self.assertEqual(projection["spans"][-1]["start_ms"], 7_250)

    def test_sequence_projection_follows_insert_reorder_and_rerecord_duration(self):
        first = speech(1, 4_000, 0)
        later = speech(2, 6_000, 1)
        initial = sequence_projection([first, later])
        self.assertEqual(
            [(span["part_id"], span["start_ms"]) for span in initial["spans"]],
            [(1, 0), (2, 4_000)],
        )

        inserted = speech(3, 2_000, 1)
        after_insert = sequence_projection([first, inserted, later])
        self.assertEqual(after_insert["spans"][2]["start_ms"], 6_000)

        rerecorded = {**first, "duration_ms": 7_000, "clip_id": 99}
        after_record = sequence_projection([rerecorded, inserted, later])
        self.assertEqual(after_record["spans"][2]["start_ms"], 9_000)
        self.assertNotEqual(initial["signature"], after_record["signature"])

    def test_part_anchor_follows_sequence_changes_without_mutating_document(self):
        target_public_id = speech(2, 6_000, 1)["public_id"]
        original = anchored_scene(target_public_id)
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
        resolved = resolve_scene(
            anchored_scene(speech(2, 6_000, 1)["public_id"]),
            [speech(1, 4_000, 0)],
        )
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
        scene["tracks"].append({
            "id": "music", "kind": "music", "name": "Music",
            "volume": 1, "muted": False, "clips": [{
            "id": "78af885c-aeb4-49bf-9edb-d3fc14496b2c",
            "asset_id": 9, "start_ms": 0, "duration_ms": None,
            "source_offset_ms": 0, "gain": .1, "fade_in_ms": 0,
            "fade_out_ms": 0, "loop": True, "ducking": True,
            "anchor": {"kind": "absolute", "position_ms": 0},
            }],
        })
        first = resolve_scene(scene, [speech(1, 4_000, 0)])
        longer = resolve_scene(scene, [speech(1, 9_000, 0)])
        self.assertEqual(first["tracks"][0]["clips"][0]["resolved_duration_ms"], 4_000)
        self.assertEqual(longer["tracks"][0]["clips"][0]["resolved_duration_ms"], 9_000)
        self.assertEqual(longer["duration_ms"], 9_000)

    def test_explicit_sound_clip_can_extend_beyond_sequence(self):
        scene = anchored_scene(speech(1, 4_000, 0)["public_id"])
        clip = scene["tracks"][0]["clips"][0]
        clip["anchor"] = {
            "kind": "part", "part_public_id": speech(1, 4_000, 0)["public_id"],
            "edge": "end", "offset_ms": 500,
        }
        clip["duration_ms"] = 2_000

        resolved = resolve_scene(scene, [speech(1, 4_000, 0)])

        placed = resolved["tracks"][0]["clips"][0]
        self.assertEqual(placed["resolved_start_ms"], 4_500)
        self.assertEqual(placed["resolved_duration_ms"], 2_000)
        self.assertEqual(resolved["duration_ms"], 6_500)

    def test_track_volume_is_normalized_separately_from_clip_gain(self):
        scene = empty_scene()
        scene["tracks"].append({
            "id": "music", "kind": "music", "name": "Music",
            "volume": .65, "muted": False, "clips": [],
        })
        resolved = resolve_scene(scene, [speech(1, 4_000, 0)])
        self.assertEqual(resolved["tracks"][0]["volume"], .65)


if __name__ == "__main__":
    unittest.main()
