"""Alibaba connection checks must stay non-generative and secret-safe."""

from __future__ import annotations

from types import SimpleNamespace
import unittest
from unittest.mock import patch

from origins.config import AlibabaEnvironment
from origins.providers.alibaba import connection


class AlibabaConnectionTests(unittest.TestCase):
    def test_missing_key_is_reported_without_calling_alibaba(self):
        environment = AlibabaEnvironment("intl", "workspace", False)
        with patch.object(connection, "alibaba_environment", return_value=environment), \
                patch.object(connection.Models, "list") as models:
            result = connection.test_saved_connection()
        self.assertFalse(result["connected"])
        self.assertIn("API key", result["reason"])
        models.assert_not_called()

    def test_success_uses_model_listing_without_running_inference(self):
        environment = AlibabaEnvironment("intl", "workspace", True)
        with patch.object(connection, "alibaba_environment", return_value=environment), \
                patch.object(connection.sdk_runtime, "apply_credentials") as apply, \
                patch.object(
                    connection.Models, "list",
                    return_value=SimpleNamespace(status_code=200),
                ) as models:
            result = connection.test_saved_connection()
        self.assertTrue(result["connected"])
        self.assertEqual(result["region_label"], "Singapore")
        apply.assert_called_once_with()
        models.assert_called_once_with(page_size=1)

    def test_rejected_key_returns_a_human_reason_without_provider_payload(self):
        environment = AlibabaEnvironment("beijing", "", True)
        response = SimpleNamespace(
            status_code=401,
            code="InvalidApiKey",
            message="secret provider diagnostic",
        )
        with patch.object(connection, "alibaba_environment", return_value=environment), \
                patch.object(connection.sdk_runtime, "apply_credentials"), \
                patch.object(connection.Models, "list", return_value=response):
            result = connection.test_saved_connection()
        self.assertFalse(result["connected"])
        self.assertEqual(result["reason"], "Alibaba rejected the saved API key.")
        self.assertNotIn("secret", str(result))


if __name__ == "__main__":
    unittest.main()
