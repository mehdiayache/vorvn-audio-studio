"""Saved Director references remain small Venture-owned groupings."""

import unittest

from audio_studio.application.saved_references import SavedReferenceService


class Records:
    def __init__(self):
        self.created = None

    def list(self, venture_id):
        return []

    def create(self, venture_id, draft):
        self.created = (venture_id, draft)
        return {"id": "ref-1", "name": draft.name,
                "type": draft.reference_type,
                "asset_ids": list(draft.asset_ids)}

    def delete(self, venture_id, reference_id):
        return venture_id == 4 and reference_id == "ref-1"


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


if __name__ == "__main__":
    unittest.main()
