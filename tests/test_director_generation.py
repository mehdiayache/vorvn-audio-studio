from datetime import datetime, timezone
import unittest
from uuid import UUID, uuid4

from audio_studio.application.director_generation import (
    DirectorGenerationService, MockDirectorGenerationHandler,
)
from audio_studio.domain.jobs import Job, JobStatus


class FakeAssets:
    def __init__(self):
        self.exists = True
        self.assets = [
            {"id": 11, "media_type": "image"},
            {"id": 12, "media_type": "video"},
            {"id": 13, "media_type": "audio"},
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


def recipe(operation="reference-video", model_id="model-c", inputs=None):
    return {
        "operation": operation, "model_id": model_id,
        "prompt": "A quiet harbor", "negative_prompt": "text",
        "inputs": inputs or [
            {"asset_id": 11, "role": "reference",
             "media_type": "image", "position": 0},
            {"asset_id": 12, "role": "motion-reference",
             "media_type": "video", "position": 1},
            {"asset_id": 13, "role": "audio-reference",
             "media_type": "audio", "position": 2},
        ],
        "controls": {
            "ratio": "16:9", "resolution": "720p", "duration": 5,
            "fps": 24, "seed": 42, "provider_parameters": {},
        },
    }


class DirectorGenerationTest(unittest.TestCase):
    def test_capabilities_are_scoped_to_model_and_operation(self):
        service = DirectorGenerationService(FakeJobs(), FakeAssets())
        catalog = service.capabilities()
        model_c = next(model for model in catalog["models"] if model["id"] == "model-c")
        reference = next(item for item in model_c["operations"]
                         if item["operation"] == "reference-video")
        self.assertEqual([(slot["role"], slot["media_types"], slot["max"])
                          for slot in reference["inputs"]], [
            ("reference", ["image"], 3),
            ("motion-reference", ["video"], 1),
            ("audio-reference", ["audio"], 1),
        ])
        self.assertEqual(reference["prompt"], {
            "supported": True, "required": True, "negative_prompt": True})

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

    def test_recipe_rejects_noncanonical_or_incoherent_inputs(self):
        service = DirectorGenerationService(FakeJobs(), FakeAssets())
        for change, message in [
            ({"asset_id": 999}, "canonical Asset"),
            ({"media_type": "audio"}, "does not match"),
            ({"role": "voice"}, "not supported"),
        ]:
            with self.subTest(change=change):
                invalid = recipe(inputs=[{**recipe()["inputs"][0], **change}])
                with self.assertRaisesRegex(ValueError, message):
                    service.enqueue(7, invalid, idempotency_key="invalid")

    def test_missing_production_never_creates_prompt_only_job(self):
        assets = FakeAssets()
        assets.exists = False
        jobs = FakeJobs()
        service = DirectorGenerationService(jobs, assets)
        still = recipe(operation="image", model_id="model-a", inputs=[])
        still["controls"].update(
            ratio="1:1", resolution="1K", duration=None, fps=None)
        with self.assertRaisesRegex(LookupError, "Production"):
            service.enqueue(7, still, idempotency_key="orphan")
        self.assertEqual(jobs.enqueued, [])

    def test_recent_restores_exact_recipe_and_cancel_uses_same_job(self):
        jobs = FakeJobs()
        service = DirectorGenerationService(jobs, FakeAssets())
        created, _ = service.enqueue(7, recipe(), idempotency_key="history")
        self.assertEqual(service.recent(7)[0]["recipe"], recipe())
        canceled = service.cancel(7, UUID(created["job_id"]))
        self.assertEqual(canceled["status"], "canceled")
        self.assertEqual(canceled["recipe"], recipe())

    def test_mock_handler_uses_durable_progress_boundary_without_outputs(self):
        events = []

        class Progress:
            def progress(self, job_id, done, total, detail=""):
                events.append((job_id, done, total, detail))

        job = make_job(payload={"production_id": 7, "recipe": recipe()})
        result = MockDirectorGenerationHandler(pause=lambda _: None)(job, Progress())
        self.assertEqual([event[1] for event in events], [1, 2, 3])
        self.assertEqual(result, {"output_asset_ids": [],
                                  "provider_job_id": None,
                                  "estimated_cost": None})


if __name__ == "__main__":
    unittest.main()
