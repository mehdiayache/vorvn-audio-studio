import base64
import hashlib
import hmac
import time
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from audio_studio.http.errors import ApiProblem, problem_handler
from audio_studio.http.routers.provider_callbacks import router


class FakeOperations:
    def __init__(self):
        self.received = []

    def record_callback(self, provider, provider_request_id, payload):
        self.received.append((provider, provider_request_id, payload))
        return True


class ProviderCallbackTest(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.add_exception_handler(ApiProblem, problem_handler)
        app.include_router(router)
        self.client = TestClient(app)

    def test_verified_kie_callback_is_attached_to_provider_attempt(self):
        payload = {"data": {"taskId": "task-19", "state": "success"}}
        timestamp = str(int(time.time()))
        signature = base64.b64encode(hmac.new(
            b"webhook-key", f"task-19.{timestamp}".encode(),
            hashlib.sha256,
        ).digest()).decode()
        operations = FakeOperations()
        with patch.dict("os.environ", {
            "KIE_WEBHOOK_HMAC_KEY": "webhook-key",
        }, clear=True), patch(
            "audio_studio.http.routers.provider_callbacks.provider_callback_recorder",
            operations,
        ):
            response = self.client.post(
                "/api/v1/providers/kie/callback", json=payload,
                headers={
                    "X-Webhook-Timestamp": timestamp,
                    "X-Webhook-Signature": signature,
                },
            )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(operations.received, [("kie", "task-19", payload)])

    def test_invalid_kie_signature_is_rejected(self):
        with patch.dict("os.environ", {
            "KIE_WEBHOOK_HMAC_KEY": "webhook-key",
        }, clear=True):
            response = self.client.post(
                "/api/v1/providers/kie/callback",
                json={"data": {"taskId": "task-19", "state": "success"}},
                headers={
                    "X-Webhook-Timestamp": str(int(time.time())),
                    "X-Webhook-Signature": "wrong",
                },
            )
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
