"""Bulk enrollment orchestration tests; never enqueue a provider call."""

import unittest

from audio_studio.application.bulk_enrollment import BulkEnrollmentService


class FakeCampaignStore:
    def __init__(self):
        self.created = []
        self.cancelled = []
        self.retried = []

    def preflight(self, provider_model_id, selections):
        return {
            "provider_model": {"id": provider_model_id},
            "items": [{**item, "classification": "experimental"}
                      for item in selections],
            "estimated_cost": .02,
        }

    def create_campaign(self, provider_model_id, selections):
        self.created.append((provider_model_id, selections))
        return {"id": "campaign-1", "status": "queued", "queued": 2}

    def campaign(self, campaign_id):
        return ({"id": campaign_id, "status": "running", "items": []}
                if campaign_id == "campaign-1" else None)

    def cancel_campaign(self, campaign_id):
        if campaign_id != "campaign-1":
            return None
        self.cancelled.append(campaign_id)
        return {"id": campaign_id, "status": "cancelling", "items": []}

    def retry_items(self, campaign_id, item_ids):
        if campaign_id != "campaign-1":
            return None
        self.retried.append((campaign_id, item_ids))
        return {"id": campaign_id, "status": "queued", "items": item_ids}


class BulkEnrollmentTests(unittest.TestCase):
    def test_explicit_references_confirmation_cancel_and_targeted_retry(self):
        store = FakeCampaignStore()
        service = BulkEnrollmentService(store)
        selections = [
            {"identity_id": "voice-a", "reference_id": "reference-a"},
            {"identity_id": "voice-b", "reference_id": "reference-b"},
        ]
        preview = service.preflight("provider-model", selections)
        self.assertTrue(all(item["classification"] == "experimental"
                            for item in preview["items"]))
        self.assertTrue(service.create(
            "provider-model", selections, False)["needs_confirmation"])
        created = service.create("provider-model", selections, True)
        self.assertEqual(created["id"], "campaign-1")
        self.assertEqual(store.created[0][1], selections)
        self.assertEqual(service.cancel("campaign-1")["status"], "cancelling")
        self.assertEqual(
            service.retry("campaign-1", ["item-a"])["items"], ["item-a"])
        self.assertEqual(store.retried, [("campaign-1", ["item-a"])])

    def test_campaign_and_retry_validation_are_explicit(self):
        service = BulkEnrollmentService(FakeCampaignStore())
        with self.assertRaises(LookupError):
            service.get("missing")
        with self.assertRaises(ValueError):
            service.retry("campaign-1", [])


if __name__ == "__main__":
    unittest.main()
