"""Work hierarchy orchestration tests without PostgreSQL."""

import unittest

from audio_studio.application.work import WorkService
from audio_studio.domain.work import DomainValidation


class Records:
    def __init__(self):
        self.ensured = []
        self.created = []
        self.moved = []
        self.updated = []
        self.deleted_productions = []
        self.director_assets = {6: [44]}

    @staticmethod
    def hierarchy():
        return [{"id": 1, "type": "venture"}]

    @staticmethod
    def production(production_id):
        if production_id != 6:
            return None
        return {"id": 6, "name": "Evening Reset", "trail": [{"id": 2}]}

    @staticmethod
    def resource(kind, resource_id):
        if kind == "venture" and resource_id == 2:
            return {"id": 2, "type": "venture"}
        if kind == "series" and resource_id == 4:
            return {"id": 4, "type": "series", "parent_key": "project:3"}
        return None

    @staticmethod
    def overview(collection, resource_id):
        return {"resource": {"id": resource_id, "type": collection[:-1]}}

    def ensure_asset_collections(self, venture_id):
        self.ensured.append(venture_id)
        return []

    @staticmethod
    def asset_collections(_venture_id):
        return [{"id": 11, "kind": "music"}]

    @staticmethod
    def assets(_venture_id):
        return [{"id": 12, "kind": "music"}]

    @staticmethod
    def production_assets(_production_id):
        return [{"id": 12, "kind": "music", "scope": "venture"}]

    def director_asset_ids(self, production_id):
        return list(self.director_assets.get(production_id, []))

    def attach_director_asset(self, production_id, asset_id):
        if production_id != 6 or asset_id == 99:
            return None
        if asset_id not in self.director_assets.setdefault(production_id, []):
            self.director_assets[production_id].append(asset_id)
        return True

    def detach_director_asset(self, production_id, asset_id):
        if production_id != 6:
            return None
        if asset_id in self.director_assets.setdefault(production_id, []):
            self.director_assets[production_id].remove(asset_id)
        return True

    @staticmethod
    def parts(_production_id):
        return [
            {"id": 7, "kind": "audio", "size_bytes": 100},
            {"id": 8, "kind": "stitch", "size_bytes": 999},
        ]

    @staticmethod
    def exports(_production_id):
        return [{"id": 13}]

    @staticmethod
    def latest_render_job(_production_id, operation):
        return {
            "id": "job-export", "type": "render", "status": "running",
            "progress": .4, "detail": "Mixing", "error": None,
            "retries": 0, "result": {}, "operation": operation,
        }

    @staticmethod
    def accounting(_production_id):
        return {"historical_spend": 1.25, "current_sequence_cost": .75}

    def create_venture(self, name, description):
        self.created.append(("venture", name, description, None))
        return {"id": 2, "type": "venture", "name": name}

    def create_project(self, parent_id, name, description):
        self.created.append(("project", name, description, parent_id))
        return {"id": 3, "type": "project"}

    def create_series(self, parent_id, name, description):
        self.created.append(("series", name, description, parent_id))
        return {"id": 4, "type": "series"}

    def create_production(
            self, parent_id, name, description, series_id=None):
        self.created.append(("production", name, description,
                             (parent_id, series_id)))
        return {"id": 6, "type": "production", "settings": {}}

    def move_production(self, production_id, series_id):
        self.moved.append((production_id, series_id))
        return {"id": production_id, "series_id": series_id}

    def update_resource(self, kind, resource_id, changes):
        self.updated.append((kind, resource_id, changes))
        return {"id": resource_id, "type": kind, **changes}

    @staticmethod
    def delete_series(series_id, make_standalone):
        return {"id": series_id, "standalone": make_standalone}

    @staticmethod
    def archive_resource(kind, resource_id):
        return {"id": resource_id, "type": kind, "archived": True}

    def delete_production(self, resource_id):
        self.deleted_productions.append(resource_id)
        return ["clip.mp3", "/audio/preview.mp3"]


class Workspace:
    def __init__(self):
        self.discarded = []

    def discard(self, filename):
        self.discarded.append(filename)


class WorkServiceTests(unittest.TestCase):
    def setUp(self):
        self.records = Records()
        self.workspace = Workspace()
        self.service = WorkService(self.records, self.workspace)

    def test_new_venture_initializes_its_static_asset_collections(self):
        created = self.service.create("ventures", None, "Heartsnotes")
        self.assertEqual(created["id"], 2)
        self.assertEqual(self.records.ensured, [2])

    def test_series_production_uses_the_series_project(self):
        self.service.create_in_series(4, "Evening Reset")
        self.assertEqual(
            self.records.created[-1],
            ("production", "Evening Reset", "", (3, 4)))

    def test_editor_keeps_history_but_excludes_stitch_bytes(self):
        editor = self.service.production_editor(6)
        self.assertEqual(editor["total_cost"], 1.25)
        self.assertEqual(editor["current_sequence_cost"], .75)
        self.assertEqual(editor["total_bytes"], 100)
        self.assertEqual(editor["exports"], [{"id": 13}])
        self.assertEqual(editor["export_job"]["id"], "job-export")
        self.assertEqual(editor["export_job"]["operation"], "export")

    def test_production_assets_resolve_the_owning_venture(self):
        result = self.service.production_assets(6)
        self.assertEqual(result["venture"]["id"], 2)
        self.assertEqual(result["collections"][0]["kind"], "music")
        self.assertEqual(result["assets"][0]["scope"], "venture")
        self.assertEqual(result["director_asset_ids"], [44])

    def test_director_collection_is_idempotent_and_never_deletes_asset_truth(self):
        first = self.service.attach_director_asset(6, 45)
        second = self.service.attach_director_asset(6, 45)
        self.assertEqual(first, {"asset_id": 45, "attached": True})
        self.assertEqual(second, first)
        self.assertEqual(self.records.director_assets[6], [44, 45])
        removed = self.service.detach_director_asset(6, 45)
        self.assertEqual(removed, {"asset_id": 45, "attached": False})
        self.assertEqual(self.records.director_assets[6], [44])

    def test_director_rejects_assets_outside_visual_production_truth(self):
        with self.assertRaisesRegex(
                DomainValidation, "image and video Assets"):
            self.service.attach_director_asset(6, 99)

    def test_series_defaults_are_normalized_and_strictly_validated(self):
        result = self.service.update("series", 4, {"defaults": {
            "voice_identity_id": "identity-sarah",
            "language": "Arabic"}})
        self.assertEqual(result["defaults"], {
            "voice_identity_id": "identity-sarah",
            "language": "Arabic"})
        with self.assertRaisesRegex(DomainValidation, "Unknown Series default"):
            self.service.update("series", 4, {"defaults": {"mystery": True}})
        with self.assertRaisesRegex(DomainValidation, "Unknown Series default"):
            self.service.update("series", 4, {"defaults": {"engine": "audio"}})

    def test_moving_a_production_does_not_mutate_the_caller_payload(self):
        changes = {"series_id": 4, "name": "Renamed"}
        self.service.update("productions", 6, changes)
        self.assertEqual(changes, {"series_id": 4, "name": "Renamed"})
        self.assertEqual(self.records.moved, [(6, 4)])
        self.assertEqual(self.records.updated[-1],
                         ("production", 6, {"name": "Renamed"}))

    def test_production_remove_is_permanent_and_discards_owned_media(self):
        self.assertEqual(self.service.remove("productions", 6), {
            "id": 6, "type": "production", "deleted": True,
        })
        self.assertEqual(self.records.deleted_productions, [6])
        self.assertEqual(
            self.workspace.discarded,
            ["clip.mp3", "/audio/preview.mp3"],
        )


if __name__ == "__main__":
    unittest.main()
