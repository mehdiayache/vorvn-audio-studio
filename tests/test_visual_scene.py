"""Small Visual Scene domain and use-case contracts."""

from copy import deepcopy
import unittest
from uuid import uuid4

import psycopg

from origins.application.visual_scenes import VisualSceneService
from origins.application.workspaces import WorkspaceService
from origins.config import settings
from origins.domain.visual_scene import (
    VisualSceneError,
    empty_scene,
    normalize_scene,
)
from origins.infrastructure.postgres.visual_scenes import VisualSceneRepository
from origins.infrastructure.postgres.workspaces import WorkspaceRepository


def scene_with_clip(*, file_id: int = 9) -> dict:
    return {
        "version": 1,
        "canvas": {"width": 1920, "height": 1080},
        "tracks": [{
            "id": "visual-1", "name": "Visual 1",
            "media_type": "image",
            "visible": True, "locked": False,
            "clips": [{
                "id": str(uuid4()), "file_id": file_id,
                "start_ms": 1_500, "duration_ms": 5_000,
                "source_offset_ms": 0, "fit": "cover",
                "position_x": 0, "position_y": 0,
                "scale": 1, "rotation_degrees": 0,
                "flip_horizontal": False, "flip_vertical": False,
                "opacity": 1, "locked": False,
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
        self.assertEqual(empty_scene(), {
            "version": 1,
            "canvas": {"width": 1920, "height": 1080},
            "tracks": [],
        })

    def test_normalization_keeps_only_v1_visual_placement_truth(self):
        expected = scene_with_clip()
        incoming = deepcopy(expected)
        incoming["ui_selection"] = "not canonical"
        incoming["tracks"][0]["expanded"] = True
        incoming["tracks"][0]["clips"][0]["opacity"] = .5
        incoming["tracks"][0]["clips"][0]["position_x"] = 42
        incoming["tracks"][0]["clips"][0]["scale"] = 1.25
        incoming["tracks"][0]["clips"][0]["rotation_degrees"] = -32.5
        incoming["tracks"][0]["clips"][0]["flip_horizontal"] = True
        expected["tracks"][0]["clips"][0].update({
            "opacity": .5, "position_x": 42.0, "scale": 1.25,
            "rotation_degrees": -32.5, "flip_horizontal": True,
        })

        canonical = normalize_scene(incoming)

        self.assertEqual(canonical, expected)
        self.assertNotIn("ui_selection", canonical)
        self.assertNotIn("expanded", canonical["tracks"][0])
        self.assertEqual(canonical["tracks"][0]["clips"][0]["opacity"], .5)
        self.assertEqual(canonical["tracks"][0]["clips"][0]["position_x"], 42)
        self.assertEqual(canonical["tracks"][0]["clips"][0]["position_y"], 0)
        self.assertEqual(canonical["tracks"][0]["clips"][0]["scale"], 1.25)
        self.assertEqual(
            canonical["tracks"][0]["clips"][0]["rotation_degrees"], -32.5)
        self.assertTrue(
            canonical["tracks"][0]["clips"][0]["flip_horizontal"])
        self.assertFalse(
            canonical["tracks"][0]["clips"][0]["flip_vertical"])
        self.assertEqual(normalize_scene(canonical), canonical)

    def test_incomplete_documents_are_rejected_instead_of_upgraded(self):
        for missing_path in ("canvas", "media_type", "fit"):
            document = scene_with_clip()
            if missing_path == "canvas":
                document.pop("canvas")
            elif missing_path == "media_type":
                document["tracks"][0].pop("media_type")
            else:
                document["tracks"][0]["clips"][0].pop("fit")
            with self.subTest(missing_path=missing_path):
                with self.assertRaises(VisualSceneError):
                    normalize_scene(document)

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


class VisualSceneRepositoryTests(unittest.TestCase):
    """Exercise the scene boundary against the canonical Origins schema."""

    @classmethod
    def setUpClass(cls):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            raise unittest.SkipTest(str(error)) from error
        connection.close()

    def setUp(self):
        self.workspace = WorkspaceService(WorkspaceRepository()).create_workspace(
            f"Visual scene fixture {uuid4().hex[:12]}",
            "Disposable integration fixture",
        )

    def tearDown(self):
        with psycopg.connect(settings.database_url) as database:
            database.execute(
                "DELETE FROM workspaces WHERE id=%s", (self.workspace["id"],))
            database.commit()

    def test_fresh_audiovisual_production_has_a_loadable_visual_scene(self):
        production = WorkspaceService(
            WorkspaceRepository()).create_audiovisual_production(
                self.workspace["id"], "Fresh audiovisual Production")

        scene = VisualSceneRepository().get(production["id"])

        self.assertIsNotNone(scene)
        self.assertEqual(scene["production_id"], production["id"])
        self.assertEqual(scene["revision"], 1)
        self.assertEqual(scene["document"], empty_scene())

    def test_archived_production_does_not_recreate_a_missing_visual_scene(self):
        production = WorkspaceService(
            WorkspaceRepository()).create_audiovisual_production(
                self.workspace["id"], "Archived audiovisual Production")
        with psycopg.connect(settings.database_url) as database:
            database.execute(
                "UPDATE productions SET status='archived' WHERE id=%s",
                (production["id"],),
            )
            database.execute(
                "DELETE FROM visual_scenes WHERE production_id=%s", (production["id"],))
            database.commit()

        self.assertIsNone(VisualSceneRepository().get(production["id"]))


if __name__ == "__main__":
    unittest.main()
