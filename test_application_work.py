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
    def parts(_production_id):
        return [
            {"id": 7, "kind": "audio", "size_bytes": 100},
            {"id": 8, "kind": "stitch", "size_bytes": 999},
        ]

    @staticmethod
    def exports(_production_id):
        return [{"id": 13}]

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


class WorkServiceTests(unittest.TestCase):
    def setUp(self):
        self.records = Records()
        self.service = WorkService(self.records)

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

    def test_production_assets_resolve_the_owning_venture(self):
        result = self.service.production_assets(6)
        self.assertEqual(result["venture"]["id"], 2)
        self.assertEqual(result["collections"][0]["kind"], "music")

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
            self.service.update("series", 4, {"defaults": {"engine": "omni"}})

    def test_moving_a_production_does_not_mutate_the_caller_payload(self):
        changes = {"series_id": 4, "name": "Renamed"}
        self.service.update("productions", 6, changes)
        self.assertEqual(changes, {"series_id": 4, "name": "Renamed"})
        self.assertEqual(self.records.moved, [(6, 4)])
        self.assertEqual(self.records.updated[-1],
                         ("production", 6, {"name": "Renamed"}))


if __name__ == "__main__":
    unittest.main()
