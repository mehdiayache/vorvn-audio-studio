from datetime import datetime, timezone
import unittest
from uuid import UUID, uuid4

from audio_studio.application.director_generation import DirectorGenerationService
from audio_studio.domain.jobs import Job, JobStatus


class FakeAssets:
    def __init__(self):
        self.exists = True
        self.assets = [
            {"id": 11, "media_type": "image"},
            {"id": 12, "media_type": "video", "duration_ms": 12_000},
            {"id": 13, "media_type": "audio", "duration_ms": 8_000},
            {"id": 14, "media_type": "image"},
        ]

    def production_exists(self, production_id):
        return self.exists and production_id == 7

    def list_for_production(self, production_id):
        return self.assets if production_id == 7 else []


class FakeJobs:
    def __init__(self):
        self.enqueued = []
        self.jobs = []

    def enqueue(self, kind, payload, **values):
        self.enqueued.append((kind, payload, values))
        job = make_job(payload=payload)
        self.jobs.insert(0, job)
        return job, True

    def recent_for_production(self, production_id, *, kind, limit=8):
        return self.jobs[:limit]

    def get(self, public_id):
        return next((job for job in self.jobs if job.public_id == public_id), None)

    def cancel(self, public_id):
        job = self.get(public_id)
        if not job:
            return None
        canceled = make_job(payload=job.payload, status=JobStatus.CANCELLED,
                            public_id=job.public_id)
        self.jobs = [canceled if item.public_id == public_id else item
                     for item in self.jobs]
        return canceled


def make_job(*, payload=None, status=JobStatus.QUEUED, public_id=None):
    return Job(
        id=1, public_id=public_id or uuid4(), kind="director_generate",
        status=status, payload=payload or {}, progress=0,
        created_at=datetime.now(timezone.utc),
    )


def recipe(
    operation="text_to_video",
    model_id="kling-3.0-omni/text-to-video", inputs=None,
):
    return {
        "operation": operation, "model_id": model_id,
        "prompt": "A quiet harbor", "negative_prompt": "",
        "inputs": inputs if inputs is not None else [],
        "controls": {
            "ratio": "16:9", "resolution": "720p", "duration": 5,
            "fps": None, "seed": None,
            "provider_parameters": {
                "audio": False, "customize_multi_shots": False,
                "prefer_multi_shots": False, "elements": [],
            },
        },
    }


class DirectorGenerationTest(unittest.TestCase):
    def test_capabilities_are_scoped_to_model_and_operation(self):
        service = DirectorGenerationService(FakeJobs(), FakeAssets())
        catalog = service.capabilities()
        model_c = next(
            model for model in catalog["models"]
            if model["id"] == "kling-3.0-omni/text-to-video")
        text_video = next(item for item in model_c["operations"]
                          if item["operation"] == "text_to_video")
        self.assertEqual(text_video["inputs"], [])
        self.assertEqual(text_video["resolutions"], ["720p", "1080p", "4k"])
        self.assertEqual(text_video["prompt"], {
            "supported": True, "required": True,
            "negative_prompt": False, "max_length": 3072})
        fields = {field["key"]: field for field in text_video["parameters"]}
        self.assertEqual(fields["multi_prompt"]["item"]["max_items"], 6)
        self.assertEqual(fields["elements"]["type"], "asset_list")
        self.assertTrue(fields["elements"]["item"]["description_required"])
        self.assertEqual(
            fields["customize_multi_shots"]["conflicts_with"],
            ["prefer_multi_shots"])
        self.assertEqual(model_c["provider_id"], "kie")
        self.assertEqual(model_c["status"], "verified")
        self.assertEqual(len(catalog["models"]), 1)

    def test_enqueue_keeps_one_ordered_canonical_input_contract(self):
        jobs = FakeJobs()
        service = DirectorGenerationService(jobs, FakeAssets())
        projected, created = service.enqueue(7, recipe(), idempotency_key="one")
        self.assertTrue(created)
        kind, payload, values = jobs.enqueued[0]
        self.assertEqual(kind, "director_generate")
        self.assertEqual(payload["recipe"]["inputs"], recipe()["inputs"])
        self.assertNotIn("input_asset_ids", payload["recipe"])
        self.assertNotIn("input_roles", payload["recipe"])
        self.assertEqual(values["production_id"], 7)
        self.assertEqual(projected["recipe"], recipe())
        self.assertEqual(payload["provider_model_id"], model_c_id())
        self.assertEqual(
            payload["capability_snapshot"]["operations"][0]["operation"],
            "text_to_video")

    def test_recipe_rejects_noncanonical_or_incoherent_inputs(self):
        service = DirectorGenerationService(FakeJobs(), FakeAssets())
        for asset_ids, message in [
            ([11, 999], "canonical Asset"),
            ([11, 13], "incompatible Asset"),
            ([11, 11], "unique canonical Asset"),
        ]:
            with self.subTest(asset_ids=asset_ids):
                invalid = recipe()
                invalid["controls"]["provider_parameters"]["elements"] = [{
                    "name": "hero", "description": "The main character",
                    "variant": "images", "asset_ids": asset_ids,
                    "audio_asset_ids": [],
                }]
                with self.assertRaisesRegex(ValueError, message):
                    service.enqueue(7, invalid, idempotency_key="invalid")

        missing_description = recipe()
        missing_description["controls"]["provider_parameters"]["elements"] = [{
            "name": "hero", "description": "", "variant": "images",
            "asset_ids": [11, 14], "audio_asset_ids": [],
        }]
        with self.assertRaisesRegex(ValueError, "description"):
            service.enqueue(7, missing_description,
                            idempotency_key="missing-description")

    def test_missing_production_never_creates_prompt_only_job(self):
        assets = FakeAssets()
        assets.exists = False
        jobs = FakeJobs()
        service = DirectorGenerationService(jobs, assets)
        still = recipe(
            operation="text_to_video",
            model_id="kling-3.0-omni/text-to-video", inputs=[])
        with self.assertRaisesRegex(LookupError, "Production"):
            service.enqueue(7, still, idempotency_key="orphan")
        self.assertEqual(jobs.enqueued, [])

    def test_recent_restores_exact_recipe_and_cancel_uses_same_job(self):
        jobs = FakeJobs()
        service = DirectorGenerationService(jobs, FakeAssets())
        created, _ = service.enqueue(7, recipe(), idempotency_key="history")
        self.assertEqual(service.recent(7)[0]["recipe"], recipe())
        with self.assertRaisesRegex(ValueError, "cannot be canceled"):
            service.cancel(7, UUID(created["job_id"]))

    def test_multi_shot_contract_requires_exact_total_duration(self):
        service = DirectorGenerationService(FakeJobs(), FakeAssets())
        value = recipe(
            operation="text_to_video",
            model_id="kling-3.0-omni/text-to-video", inputs=[])
        value["controls"]["provider_parameters"] = {
            "audio": False, "customize_multi_shots": True,
            "multi_prompt": [
                {"prompt": "Opening", "duration": 2},
                {"prompt": "Closing", "duration": 2},
            ],
        }
        with self.assertRaisesRegex(ValueError, "add up"):
            service.enqueue(7, value, idempotency_key="shots")


def model_c_id():
    return "kling-3.0-omni/text-to-video"


if __name__ == "__main__":
    unittest.main()
