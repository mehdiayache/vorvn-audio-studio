from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from uuid import uuid4

from audio_studio.application.director_generation_execution import (
    DirectorGenerationHandler,
)
from audio_studio.application.provider_operations import ProviderOperationService
from audio_studio.domain.jobs import Job, JobStatus
from audio_studio.providers.director import (
    DirectorProviderState, DirectorSubmission,
)


class FakeProvider:
    provider_id = "kie"

    def __init__(self):
        self.request = None

    def submit(self, request):
        self.request = request
        return DirectorSubmission("provider-job")

    def task(self, provider_job_id):
        return DirectorProviderState(
            "succeeded", ("https://provider.test/result.mp4",), raw={})

    def state_from_callback(self, payload):
        return self.task("provider-job")

    def download(self, url, target):
        target.write_bytes(b"generated-video")
        return target.stat().st_size

    def cancel(self, provider_job_id):
        return None


class FakeAdapter:
    def __init__(self):
        self.values = None

    def request(self, **values):
        self.values = values
        return {"model": values["model"]["provider_model_id"], "input": {}}


class FakeAssets:
    def __init__(self):
        self.attached = []

    def list_for_production(self, production_id):
        return [
            {"id": 11, "name": "Front", "media_type": "image",
             "path": "/assets/front.png", "mime_type": "image/png"},
            {"id": 14, "name": "Side", "media_type": "image",
             "path": "/assets/side.png", "mime_type": "image/png"},
        ]

    def output_collection_for_production(self, production_id):
        return 44

    def attach_to_director(self, production_id, asset_id):
        self.attached.append((production_id, asset_id))


class FakeMaterializer:
    def materialize(self, asset, *, job_id, role):
        return {
            "asset_id": asset["id"], "role": role,
            "media_type": asset["media_type"],
            "url": f"https://temporary.test/{asset['id']}",
        }


class FakeUploads:
    def __init__(self):
        self.metadata = None

    def prepare_asset_upload(self, filename, **values):
        self.metadata = values["metadata"]
        return {"filename": filename, **values}

    def save_generated_asset_file(self, collection_id, path, size, **values):
        return {"asset": {"id": 88}}


class FakeProgress:
    def __init__(self):
        self.details = []

    def progress(self, job_id, completed, total, detail):
        self.details.append((completed, total, detail))


class FakeOperationRepository:
    def __init__(self):
        self.attempt = None
        self.begin_count = 0
        self.sent = []

    def attempt_for_job(self, job_id, operation):
        return self.attempt

    def begin_attempt(self, job_id, operation, route, payload,
                      reservation_id, estimated_cost=None):
        self.begin_count += 1
        self.attempt = {
            "id": "51", "status": "not_sent", "provider": route["provider"],
            "provider_request_id": None, "diagnostics": {}, "usage": {},
        }
        return "51"

    def mark_sent(self, attempt_id, provider_request_id=None):
        self.sent.append((attempt_id, provider_request_id))
        self.attempt.update({
            "status": "sent", "provider_request_id": provider_request_id,
        })

    def finish_attempt(self, attempt_id, status, **values):
        self.attempt.update({"status": status, "usage": values.get("usage", {})})

    def record_artifact(self, attempt_id, artifact):
        self.attempt["diagnostics"]["local_artifact"] = artifact

    def record_callback(self, provider, provider_request_id, payload):
        self.attempt["diagnostics"]["provider_callback"] = payload
        return True


class DirectorGenerationExecutionTest(unittest.TestCase):
    def test_subject_assets_materialize_temporarily_and_output_becomes_canonical(self):
        provider = FakeProvider()
        adapter = FakeAdapter()
        assets = FakeAssets()
        uploads = FakeUploads()
        public_id = uuid4()
        recipe = {
            "operation": "text_to_video",
            "model_id": "kling-3.0-omni/text-to-video",
            "prompt": "@hero walks into frame",
            "negative_prompt": "",
            "inputs": [],
            "controls": {
                "ratio": "16:9", "resolution": "720p", "duration": 5,
                "fps": None, "seed": None,
                "provider_parameters": {
                    "elements": [{
                        "name": "hero", "description": "Main character",
                        "variant": "images", "asset_ids": [11, 14],
                        "audio_asset_ids": [],
                    }],
                },
            },
        }
        operation = {
            "operation": "text_to_video", "output_media_type": "video",
            "parameters": [{"key": "elements", "type": "asset_list"}],
            "output": {"extension": "mp4"},
        }
        job = Job(
            id=1, public_id=public_id, kind="director_generate",
            status=JobStatus.QUEUED,
            payload={
                "production_id": 7, "provider_id": "kie",
                "model": "kling-3.0-omni/text-to-video",
                "provider_model_id": "kling-3.0-omni/text-to-video",
                "adapter_version": "adapter-1",
                "capability_manifest_version": "manifest-1",
                "recipe": recipe,
                "capability_snapshot": {
                    "label": "Kling", "provider_model_id": recipe["model_id"],
                    "operations": [operation],
                },
            },
            progress=0, created_at=datetime.now(timezone.utc),
        )
        with TemporaryDirectory() as directory:
            operation_records = FakeOperationRepository()
            handler = DirectorGenerationHandler(
                providers={"kie": provider},
                model_adapters={recipe["model_id"]: adapter},
                assets=assets, uploads=uploads,
                materializer=FakeMaterializer(),
                operations=ProviderOperationService(operation_records),
                scratch_root=Path(directory), poll_interval=0, sleeper=lambda _: None,
            )
            result = handler(job, FakeProgress())

        groups = adapter.values["materialized_parameters"]["elements"]
        self.assertEqual(
            [asset["asset_id"] for asset in groups[0]["assets"]], [11, 14])
        self.assertTrue(all(asset["url"].startswith("https://temporary.test/")
                            for asset in groups[0]["assets"]))
        self.assertEqual(result["output_asset_ids"], [88])
        self.assertEqual(assets.attached, [(7, 88)])
        self.assertEqual(uploads.metadata["recipe"], recipe)
        self.assertNotIn("temporary.test", str(uploads.metadata["recipe"]))
        self.assertEqual(operation_records.sent, [("51", "provider-job")])
        self.assertEqual(
            operation_records.attempt["diagnostics"]["local_artifact"],
            {"output_asset_ids": [88]})

    def test_resumes_persisted_provider_task_without_submitting_again(self):
        provider = FakeProvider()
        provider.submit = lambda _request: self.fail("submit must not run")
        operations = FakeOperationRepository()
        operations.attempt = {
            "id": "71", "status": "sent", "provider": "kie",
            "provider_request_id": "existing-task", "diagnostics": {},
            "usage": {},
        }
        recipe = {
            "operation": "text_to_video", "prompt": "Quiet harbor",
            "inputs": [], "controls": {"provider_parameters": {}},
        }
        job = Job(
            id=9, public_id=uuid4(), kind="director_generate",
            status=JobStatus.RETRYING,
            payload={
                "production_id": 7, "provider_id": "kie",
                "model": "kling-3.0-omni/text-to-video",
                "provider_model_id": "kling-3.0-omni/text-to-video",
                "recipe": recipe,
                "capability_snapshot": {
                    "provider_model_id": "kling-3.0-omni/text-to-video",
                    "operations": [{"operation": "text_to_video",
                                    "parameters": [],
                                    "output": {"extension": "mp4"}}],
                },
            }, progress=0, created_at=datetime.now(timezone.utc),
        )
        with TemporaryDirectory() as directory:
            result = DirectorGenerationHandler(
                providers={"kie": provider},
                model_adapters={job.payload["model"]: FakeAdapter()},
                assets=FakeAssets(), uploads=FakeUploads(),
                materializer=FakeMaterializer(),
                operations=ProviderOperationService(operations),
                scratch_root=Path(directory), poll_interval=0,
                sleeper=lambda _: None,
            )(job, FakeProgress())
        self.assertEqual(result["provider_job_id"], "existing-task")
        self.assertEqual(operations.begin_count, 0)


if __name__ == "__main__":
    unittest.main()
