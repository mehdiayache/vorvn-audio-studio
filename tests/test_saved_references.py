"""Saved Director references remain small Venture-owned groupings."""

import unittest

from audio_studio.application.saved_references import SavedReferenceService


class Records:
    def __init__(self):
        self.created = None

    def list(self, venture_id):
        return []

    def list_space(self, space_id):
        return [{"id": f"space-{space_id}"}]

    def create(self, venture_id, draft):
        self.created = (venture_id, draft)
        return {"id": "ref-1", "name": draft.name,
                "type": draft.reference_type,
                "asset_ids": list(draft.asset_ids)}

    def create_space(self, space_id, draft):
        self.created = (space_id, draft)
        return {"id": "space-ref-1", "name": draft.name,
                "type": draft.reference_type,
                "asset_ids": list(draft.asset_ids)}

    def delete(self, venture_id, reference_id):
        return venture_id == 4 and reference_id == "ref-1"

    def delete_space(self, space_id, reference_id):
        return space_id == 8 and reference_id == "space-ref-1"


class SavedReferenceServiceTests(unittest.TestCase):
    def test_create_preserves_order_and_deduplicates_assets(self):
        records = Records()
        result = SavedReferenceService(records).create(
            4, name="  Harbor guide  ", reference_type="character",
            asset_ids=[9, 4, 9],
        )
        self.assertEqual(result["asset_ids"], [9, 4])
        self.assertEqual(records.created[1].name, "Harbor guide")

    def test_create_rejects_empty_and_unknown_types(self):
        service = SavedReferenceService(Records())
        with self.assertRaisesRegex(ValueError, "at least one"):
            service.create(4, name="Guide", reference_type="character",
                           asset_ids=[])
        with self.assertRaisesRegex(ValueError, "supported"):
            service.create(4, name="Guide", reference_type="folder",
                           asset_ids=[9])

    def test_space_reference_uses_space_ownership(self):
        records = Records()
        service = SavedReferenceService(records)
        created = service.create_space(
            8, name="Look", reference_type="style", asset_ids=[12])
        self.assertEqual(created["id"], "space-ref-1")
        self.assertEqual(records.created[0], 8)
        self.assertEqual(service.list_space(8), [{"id": "space-8"}])
        self.assertTrue(service.delete_space(8, "space-ref-1"))


if __name__ == "__main__":
    unittest.main()
