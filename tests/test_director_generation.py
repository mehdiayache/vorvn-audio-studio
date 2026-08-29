from datetime import datetime, timezone
import unittest
from uuid import UUID, uuid4

from audio_studio.application.director_generation import DirectorGenerationService
from audio_studio.domain.director_models import KIE_CONTRACT_EVIDENCE
from audio_studio.domain.jobs import Job, JobStatus


class FakeAssets:
    def __init__(self):
        self.exists = True
        self.assets = [
            {"id": 11, "media_type": "image", "mime_type": "image/png",
             "size_bytes": 12_000, "width": 1280, "height": 720},
            {"id": 12, "media_type": "video", "mime_type": "video/mp4",
             "size_bytes": 20_000_000, "duration_ms": 12_000,
             "width": 1920, "height": 1080, "frame_rate": 30},
            {"id": 13, "media_type": "audio", "duration_ms": 8_000},
            {"id": 14, "media_type": "image", "mime_type": "image/jpeg",
             "size_bytes": 15_000, "width": 1280, "height": 720},
            *[
                {"id": asset_id, "media_type": "image",
                 "mime_type": "image/png", "size_bytes": 12_000,
                 "width": 1280, "height": 720}
                for asset_id in range(15, 23)
            ],
            {"id": 23, "media_type": "video", "mime_type": "video/mp4",
             "size_bytes": 18_000_000, "duration_ms": 8_000,
             "width": 1280, "height": 720, "frame_rate": 30},
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
    def test_every_enabled_kie_manifest_has_exact_contract_evidence(self):
        catalog = DirectorGenerationService(FakeJobs(), FakeAssets()).capabilities()
        enabled_kie = {
            model["provider_model_id"] for model in catalog["models"]
            if model["provider_id"] == "kie"
        }
        self.assertEqual(enabled_kie, set(KIE_CONTRACT_EVIDENCE))
        for model_id, evidence in KIE_CONTRACT_EVIDENCE.items():
            self.assertTrue(evidence["schema"].startswith(
                "https://docs.kie.ai/market/kling/v3-omni-"))
            self.assertTrue(evidence["schema"].endswith(
                model_id.rsplit("/", 1)[1]))
            self.assertEqual(evidence["endpoint"],
                             "/api/v1/jobs/createTask")

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
        self.assertEqual(fields["multi_prompt"]["exposure"], "advanced")
        self.assertEqual(fields["elements"]["type"], "asset_list")
        self.assertEqual(fields["elements"]["max"], 3)
        self.assertEqual(fields["elements"]["exposure"], "advanced")
        self.assertTrue(fields["elements"]["item"]["description_required"])
        self.assertEqual(
            fields["customize_multi_shots"]["conflicts_with"],
            ["prefer_multi_shots"])
        self.assertEqual(model_c["provider_id"], "kie")
        self.assertEqual(model_c["status"], "enabled")
        self.assertEqual(len(catalog["models"]), 3)

        image_model = next(
            model for model in catalog["models"]
            if model["id"] == "kling-3.0-omni/image-to-video")
        image_video = image_model["operations"][0]
        self.assertEqual(image_video["ratio_rules"], [
            {"when": {"customize_multi_shots": False},
             "values": ["auto"], "default": "auto"},
            {"when": {"customize_multi_shots": True},
             "values": ["16:9", "9:16", "1:1"], "default": "16:9"},
        ])
        frame_video = image_model["operations"][1]
        self.assertEqual(frame_video["operation"], "frames_to_video")
        self.assertEqual(
            [slot["role"] for slot in frame_video["inputs"]],
            ["start-frame", "end-frame"])
        self.assertEqual(frame_video["ratios"], ["auto"])
        self.assertNotIn(
            "customize_multi_shots",
            {field["key"] for field in frame_video["parameters"]})

    def test_one_image_is_a_direct_image_to_video_input_not_an_element(self):
        jobs = FakeJobs()
        service = DirectorGenerationService(jobs, FakeAssets())
        value = recipe(
            operation="image_to_video",
            model_id="kling-3.0-omni/image-to-video",
            inputs=[{
                "asset_id": 11, "role": "source-image",
                "media_type": "image", "position": 0,
            }],
        )
        value["controls"]["ratio"] = "auto"
        projected, _ = service.enqueue(7, value, idempotency_key="one-image")
        self.assertEqual(projected["recipe"]["inputs"], value["inputs"])
        self.assertEqual(
            projected["recipe"]["controls"]["provider_parameters"]["elements"],
            [],
        )

    def test_image_to_video_ratio_follows_custom_shot_mode(self):
        service = DirectorGenerationService(FakeJobs(), FakeAssets())
        value = recipe(
            operation="image_to_video",
            model_id="kling-3.0-omni/image-to-video",
            inputs=[{
                "asset_id": 11, "role": "source-image",
                "media_type": "image", "position": 0,
            }],
        )
        with self.assertRaisesRegex(ValueError, "Unsupported ratio"):
            service.enqueue(7, value, idempotency_key="invalid-fixed-ratio")

        value["controls"]["ratio"] = "auto"
        service.enqueue(7, value, idempotency_key="automatic-source-ratio")

        value["controls"]["provider_parameters"][
            "customize_multi_shots"] = True
        value["controls"]["provider_parameters"]["multi_prompt"] = [{
            "prompt": "A slow camera move", "duration": 5,
        }]
        value["controls"]["ratio"] = "16:9"
        service.enqueue(7, value, idempotency_key="directed-fixed-ratio")

    def test_start_and_end_frames_are_ordered_and_force_automatic_ratio(self):
        jobs = FakeJobs()
        service = DirectorGenerationService(jobs, FakeAssets())
        value = recipe(
            operation="frames_to_video",
            model_id="kling-3.0-omni/image-to-video",
            inputs=[
                {"asset_id": 11, "role": "start-frame",
                 "media_type": "image", "position": 0},
                {"asset_id": 14, "role": "end-frame",
                 "media_type": "image", "position": 1},
            ],
        )
        value["controls"]["ratio"] = "auto"
        value["controls"]["provider_parameters"] = {
            "audio": False, "elements": [],
        }
        projected, _ = service.enqueue(
            7, value, idempotency_key="start-end")
        self.assertEqual(
            [item["role"] for item in projected["recipe"]["inputs"]],
            ["start-frame", "end-frame"])

        reversed_value = {**value, "inputs": [
            {**value["inputs"][1], "position": 0},
            {**value["inputs"][0], "position": 1},
        ]}
        with self.assertRaisesRegex(ValueError, "semantic order"):
            service.enqueue(7, reversed_value,
                            idempotency_key="end-before-start")

    def test_image_constraints_fail_before_a_provider_job_is_created(self):
        assets = FakeAssets()
        assets.assets[0]["width"] = 240
        jobs = FakeJobs()
        service = DirectorGenerationService(jobs, assets)
        value = recipe(
            operation="image_to_video",
            model_id="kling-3.0-omni/image-to-video",
            inputs=[{
                "asset_id": 11, "role": "source-image",
                "media_type": "image", "position": 0,
            }],
        )
        value["controls"]["ratio"] = "auto"

        with self.assertRaisesRegex(ValueError, "too narrow"):
            service.enqueue(7, value, idempotency_key="too-small")
        self.assertEqual(jobs.enqueued, [])

    def test_multiple_ordinary_images_use_reference_input_slots(self):
        jobs = FakeJobs()
        service = DirectorGenerationService(jobs, FakeAssets())
        inputs = [
            {"asset_id": asset_id, "role": "reference-image",
             "media_type": "image", "position": position}
            for position, asset_id in enumerate((11, 14))
        ]
        value = recipe(
            operation="reference_to_video",
            model_id="kling-3.0-omni/reference-to-video",
            inputs=inputs,
        )
        projected, _ = service.enqueue(
            7, value, idempotency_key="ordinary-references")
        self.assertEqual(projected["recipe"]["inputs"], inputs)

    def test_reference_to_video_conditional_contracts_are_explicit(self):
        service = DirectorGenerationService(FakeJobs(), FakeAssets())
        value = recipe(
            operation="reference_to_video",
            model_id="kling-3.0-omni/reference-to-video",
            inputs=[{"asset_id": 12, "role": "reference-video",
                     "media_type": "video", "position": 0}],
        )
        value["controls"]["ratio"] = "auto"
        service.enqueue(7, value, idempotency_key="video-only")

        value["controls"]["ratio"] = "16:9"
        with self.assertRaisesRegex(ValueError, "Unsupported ratio"):
            service.enqueue(7, value, idempotency_key="video-fixed-ratio")

        value["controls"]["ratio"] = "auto"
        value["controls"]["provider_parameters"]["audio"] = True
        with self.assertRaisesRegex(ValueError, "Generate audio"):
            service.enqueue(7, value, idempotency_key="video-audio")

        value["controls"]["provider_parameters"]["audio"] = False
        value["inputs"].append({
            "asset_id": 11, "role": "reference-image",
            "media_type": "image", "position": 1,
        })
        value["controls"]["ratio"] = "16:9"
        service.enqueue(7, value, idempotency_key="video-and-image")

    def test_reference_video_technical_limits_fail_before_paid_job(self):
        assets = FakeAssets()
        assets.assets[1]["frame_rate"] = 12
        service = DirectorGenerationService(FakeJobs(), assets)
        value = recipe(
            operation="reference_to_video",
            model_id="kling-3.0-omni/reference-to-video",
            inputs=[{"asset_id": 12, "role": "reference-video",
                     "media_type": "video", "position": 0}],
        )
        value["controls"]["ratio"] = "auto"
        with self.assertRaisesRegex(ValueError, "frame rate"):
            service.enqueue(7, value, idempotency_key="slow-video")

    def test_reference_image_quota_counts_direct_and_subject_assets(self):
        service = DirectorGenerationService(FakeJobs(), FakeAssets())
        value = recipe(
            operation="reference_to_video",
            model_id="kling-3.0-omni/reference-to-video",
            inputs=[{
                "asset_id": asset_id, "role": "reference-image",
                "media_type": "image", "position": position,
            } for position, asset_id in enumerate((11, 14, 15, 16, 17, 18))],
        )
        value["controls"]["provider_parameters"]["elements"] = [{
            "name": "hero", "description": "The main character",
            "variant": "images", "asset_ids": [19, 20],
            "audio_asset_ids": [],
        }]
        with self.assertRaisesRegex(ValueError, "too many image references"):
            service.enqueue(7, value, idempotency_key="combined-image-quota")

    def test_reference_video_subject_accepts_exact_four_image_boundary(self):
        service = DirectorGenerationService(FakeJobs(), FakeAssets())
        value = recipe(
            operation="reference_to_video",
            model_id="kling-3.0-omni/reference-to-video",
            inputs=[{
                "asset_id": asset_id, "role": "reference-image",
                "media_type": "image", "position": position,
            } for position, asset_id in enumerate((11, 14))],
        )
        value["controls"]["provider_parameters"]["elements"] = [
            {
                "name": "hero", "description": "The main character",
                "variant": "images", "asset_ids": [15, 16],
                "audio_asset_ids": [],
            },
            {
                "name": "guide", "description": "The guide character",
                "variant": "video", "asset_ids": [23],
                "audio_asset_ids": [], "start_time_ms": 0,
                "end_time_ms": 8000,
            },
        ]
        projected, _ = service.enqueue(
            7, value, idempotency_key="mixed-reference-boundary")
        self.assertEqual(projected["recipe"], value)

    def test_video_input_rejects_image_plus_video_subject(self):
        service = DirectorGenerationService(FakeJobs(), FakeAssets())
        value = recipe(
            operation="reference_to_video",
            model_id="kling-3.0-omni/reference-to-video",
            inputs=[
                {"asset_id": 12, "role": "reference-video",
                 "media_type": "video", "position": 0},
                {"asset_id": 11, "role": "reference-image",
                 "media_type": "image", "position": 1},
            ],
        )
        value["controls"]["provider_parameters"].update({
            "customize_multi_shots": True,
            "multi_prompt": [{"prompt": "Opening", "duration": 5}],
            "elements": [{
                "name": "hero", "description": "The main character",
                "variant": "video", "asset_ids": [23],
                "audio_asset_ids": [], "start_time_ms": 0,
                "end_time_ms": 8000,
            }],
        })
        with self.assertRaisesRegex(
            ValueError, "Video subjects cannot be mixed",
        ):
            service.enqueue(7, value, idempotency_key="forbidden-mix")

    def test_video_only_elements_require_directed_multi_shot_mode(self):
        service = DirectorGenerationService(FakeJobs(), FakeAssets())
        value = recipe(
            operation="reference_to_video",
            model_id="kling-3.0-omni/reference-to-video",
            inputs=[{"asset_id": 12, "role": "reference-video",
                     "media_type": "video", "position": 0}],
        )
        value["controls"]["ratio"] = "auto"
        value["controls"]["provider_parameters"]["elements"] = [{
            "name": "hero", "description": "The main character",
            "variant": "video", "asset_ids": [23],
            "audio_asset_ids": [], "start_time_ms": 0,
            "end_time_ms": 8000,
        }]
        with self.assertRaisesRegex(ValueError, "directed multi-shot"):
            service.enqueue(7, value, idempotency_key="video-elements-mode")

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
