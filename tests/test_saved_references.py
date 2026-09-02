"""Saved Composer references remain small Workspace-owned groupings."""

import unittest

from origins.application.saved_references import SavedReferenceService


class Records:
    def __init__(self):
        self.created = None

    def list(self, workspace_id):
        return [{"id": f"workspace-{workspace_id}"}]

    def create(self, workspace_id, draft):
        self.created = (workspace_id, draft)
        return {"id": "ref-1", "name": draft.name,
                "type": draft.reference_type,
                "file_ids": list(draft.file_ids)}

    def delete(self, workspace_id, reference_id):
        return workspace_id == 8 and reference_id == "ref-1"


class SavedReferenceServiceTests(unittest.TestCase):
    def test_create_preserves_order_and_deduplicates_assets(self):
        records = Records()
        result = SavedReferenceService(records).create(
            4, name="  Harbor guide  ", reference_type="character",
            file_ids=[9, 4, 9],
        )
        self.assertEqual(result["file_ids"], [9, 4])
        self.assertEqual(records.created[1].name, "Harbor guide")

    def test_create_rejects_empty_and_unknown_types(self):
        service = SavedReferenceService(Records())
        with self.assertRaisesRegex(ValueError, "at least one"):
            service.create(4, name="Guide", reference_type="character",
                           file_ids=[])
        with self.assertRaisesRegex(ValueError, "supported"):
            service.create(4, name="Guide", reference_type="folder",
                           file_ids=[9])

    def test_reference_uses_workspace_ownership(self):
        records = Records()
        service = SavedReferenceService(records)
        created = service.create(
            8, name="Look", reference_type="style", file_ids=[12])
        self.assertEqual(created["id"], "ref-1")
        self.assertEqual(records.created[0], 8)
        self.assertEqual(service.list(8), [{"id": "workspace-8"}])
        self.assertTrue(service.delete(8, "ref-1"))


if __name__ == "__main__":
    unittest.main()
