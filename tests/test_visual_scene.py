"""Small Visual Scene domain and use-case contracts."""

from copy import deepcopy
import unittest
from uuid import uuid4

from audio_studio.application.visual_scenes import VisualSceneService
from audio_studio.domain.visual_scene import (
    VisualSceneError,
    empty_scene,
    normalize_scene,
)


def scene_with_clip(*, asset_id: int = 9) -> dict:
    return {
        "version": 1,
        "tracks": [{
            "id": "visual-1", "name": "Visual 1",
            "visible": True, "locked": False,
            "clips": [{
                "id": str(uuid4()), "asset_id": asset_id,
                "start_ms": 1_500, "duration_ms": 5_000,
                "source_offset_ms": 0, "locked": False,
            }],
        }],
    }


class Records:
    def __init__(self):
        self.scene = {
            "production_id": 6, "revision": 1,
            "document": empty_scene(),
            "updated_at": "2026-08-26T00:00:00",
        }

    def get(self, production_id):
        return self.scene if production_id == 6 else None

    def commit(self, production_id, expected_revision, document):
        if production_id != 6:
            return None
        self.scene = {
            **self.scene, "revision": expected_revision + 1,
            "document": normalize_scene(document),
        }
        return self.scene


class VisualSceneTests(unittest.TestCase):
    def test_empty_scene_is_one_deliberately_small_document(self):
        self.assertEqual(empty_scene(), {"version": 1, "tracks": []})

    def test_normalization_keeps_only_v1_visual_placement_truth(self):
        expected = scene_with_clip()
        incoming = deepcopy(expected)
        incoming["ui_selection"] = "not canonical"
        incoming["tracks"][0]["expanded"] = True
        incoming["tracks"][0]["clips"][0]["opacity"] = .5

        canonical = normalize_scene(incoming)

        self.assertEqual(canonical, expected)
        self.assertNotIn("ui_selection", canonical)
        self.assertNotIn("expanded", canonical["tracks"][0])
        self.assertNotIn("opacity", canonical["tracks"][0]["clips"][0])
        self.assertEqual(normalize_scene(canonical), canonical)

    def test_ids_are_unique_and_every_clip_has_real_time(self):
        invalid = scene_with_clip()
        invalid["tracks"][0]["clips"][0]["duration_ms"] = 0
        with self.assertRaisesRegex(VisualSceneError, "positive duration"):
            normalize_scene(invalid)

        duplicate = scene_with_clip()
        duplicate["tracks"].append({
            **duplicate["tracks"][0], "name": "Visual 2",
        })
        with self.assertRaisesRegex(VisualSceneError, "track IDs"):
            normalize_scene(duplicate)

    def test_service_exposes_one_revisioned_production_scene(self):
        service = VisualSceneService(Records())
        self.assertEqual(service.get(6)["document"], empty_scene())
        updated = service.update(6, 1, scene_with_clip())
        self.assertEqual(updated["revision"], 2)
        self.assertEqual(updated["document"]["tracks"][0]["id"], "visual-1")
        with self.assertRaisesRegex(VisualSceneError, "does not exist"):
            service.get(99)
if __name__ == "__main__":
    unittest.main()
