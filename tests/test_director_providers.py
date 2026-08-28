from __future__ import annotations

import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from audio_studio.providers.kie.models import KieModelAdapter
from audio_studio.providers.kie.provider import KieDirectorProvider


class Response(io.BytesIO):
    def __init__(self, payload: dict | bytes, headers=None):
        raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        super().__init__(raw)
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


class DirectorProviderTests(unittest.TestCase):
    def test_kie_model_adapter_translates_normalized_recipe_only_at_boundary(self):
        request = KieModelAdapter().request(
            model={
                "provider_model_id": "kling-3.0-omni/image-to-video"},
            operation={"operation": "image_to_video"},
            recipe={
                "prompt": "A slow camera move",
                "controls": {
                    "ratio": "16:9", "resolution": "1080p",
                    "duration": 7,
                    "provider_parameters": {
                        "audio": False,
                        "customize_multi_shots": False,
                    },
                },
            },
            materialized_inputs=[{
                "role": "source-image", "url": "https://assets.test/a.png"}],
            materialized_parameters={},
        )
        self.assertEqual(request, {
            "model": "kling-3.0-omni/image-to-video",
            "input": {
                "prompt": "A slow camera move", "resolution": "1080p",
                "aspect_ratio": "16:9", "duration": 7,
                "audio": False, "customize_multi_shots": False,
                "image_urls": ["https://assets.test/a.png"],
            },
        })

    def test_kie_model_adapter_materializes_subject_assets_only_at_boundary(self):
        request = KieModelAdapter().request(
            model={"provider_model_id": "kling-3.0-omni/text-to-video"},
            operation={"operation": "text_to_video"},
            recipe={
                "prompt": "@hero walks through the scene",
                "controls": {
                    "ratio": "9:16", "resolution": "4k", "duration": 5,
                    "provider_parameters": {
                        "audio": True, "customize_multi_shots": False,
                        "prefer_multi_shots": True,
                        "elements": [{"asset_ids": [11, 14]}],
                    },
                },
            },
            materialized_inputs=[],
            materialized_parameters={"elements": [{
                "name": "hero", "description": "Main character",
                "variant": "images",
                "assets": [
                    {"url": "https://assets.test/front.png"},
                    {"url": "https://assets.test/side.png"},
                ],
                "audio_assets": [{"url": "https://assets.test/voice.wav"}],
            }]},
        )
        self.assertEqual(request["input"]["elements"], [{
            "name": "hero", "description": "Main character",
            "element_input_urls": [
                "https://assets.test/front.png",
                "https://assets.test/side.png",
            ],
            "element_input_audio_urls": ["https://assets.test/voice.wav"],
        }])
        self.assertEqual(request["input"]["prefer_multi_shots"], True)

    def test_kie_provider_uses_common_task_lifecycle_and_normalizes_results(self):
        requests = []
        responses = iter([
            Response({"code": 200, "data": {"taskId": "task-1"}}),
            Response({"code": 200, "data": {
                "state": "success",
                "resultJson": json.dumps({
                    "resultUrls": ["https://files.test/result.mp4"]}),
            }}),
        ])

        def opener(request, timeout=0):
            requests.append((request, timeout))
            return next(responses)

        with patch.dict(os.environ, {"KIE_API_KEY": "secret"}, clear=True):
            provider = KieDirectorProvider(opener=opener)
            submission = provider.submit({
                "model": "kling-3.0-omni/text-to-video",
                "input": {"prompt": "Quiet sea"},
            })
            state = provider.task(submission.provider_job_id)
        self.assertEqual(submission.provider_job_id, "task-1")
        self.assertEqual(state.state, "succeeded")
        self.assertEqual(
            state.output_urls, ("https://files.test/result.mp4",))
        self.assertEqual(
            requests[0][0].full_url,
            "https://api.kie.ai/api/v1/jobs/createTask")
        self.assertEqual(
            requests[1][0].full_url,
            "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task-1")
        self.assertEqual(
            requests[0][0].headers["Authorization"], "Bearer secret")

    def test_kie_download_is_streamed_to_the_requested_file(self):
        requests = []

        def opener(request, **_kwargs):
            requests.append(request)
            return Response(b"video-data")

        provider = KieDirectorProvider(opener=opener)
        with TemporaryDirectory() as directory:
            target = Path(directory) / "result.mp4"
            size = provider.download("https://files.test/result.mp4", target)
            self.assertEqual(size, 10)
            self.assertEqual(target.read_bytes(), b"video-data")
        self.assertEqual(requests[0].headers["User-agent"], "Auvi-Studio/1.0")


if __name__ == "__main__":
    unittest.main()
