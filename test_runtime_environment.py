"""Runtime configuration refresh and validation contracts."""

from pathlib import Path
from tempfile import TemporaryDirectory
import os
import unittest
from unittest.mock import patch

from audio_studio.application import administration
from audio_studio.infrastructure import runtime_environment
from audio_studio.infrastructure.alibaba import config as alibaba_config
from audio_studio.infrastructure.alibaba import sdk_runtime
from audio_studio import config
from dataclasses import replace


class RuntimeEnvironmentTests(unittest.TestCase):
    def test_alibaba_deployment_is_dynamic_and_secret_free(self):
        with patch.dict(os.environ, {
            "DASHSCOPE_REGION": "beijing",
            "DASHSCOPE_WORKSPACE_ID": "ws-cn",
            "DASHSCOPE_API_KEY": "never-return-this",
        }, clear=False):
            environment = config.alibaba_environment()
            self.assertEqual(environment.region, "beijing")
            self.assertEqual(environment.region_label, "Beijing")
            self.assertEqual(environment.workspace_id, "ws-cn")
            self.assertTrue(environment.api_key_configured)
            self.assertNotIn("never-return-this", repr(environment))
            self.assertEqual(
                alibaba_config.http_base(),
                "https://ws-cn.cn-beijing.maas.aliyuncs.com/api/v1",
            )
            self.assertEqual(
                alibaba_config.workspace_compatible_base_url(),
                "https://ws-cn.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
            )

        with patch.dict(os.environ, {
            "DASHSCOPE_REGION": "intl",
            "DASHSCOPE_WORKSPACE_ID": "",
            "DASHSCOPE_API_KEY": "",
        }, clear=False):
            environment = config.alibaba_environment()
            self.assertEqual(environment.region_label, "Singapore")
            self.assertFalse(environment.api_key_configured)
            self.assertEqual(
                alibaba_config.http_base(),
                "https://dashscope-intl.aliyuncs.com/api/v1",
            )
            self.assertEqual(
                alibaba_config.compatible_base_url(),
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
            )

    def test_invalid_region_fails_to_the_safe_international_default(self):
        with patch.dict(os.environ, {"DASHSCOPE_REGION": "unknown"}, clear=False):
            self.assertEqual(config.alibaba_environment().region, "intl")

    def test_remote_bind_fails_closed_until_authentication_exists(self):
        with patch.object(config, "settings", replace(
                config.settings, host="0.0.0.0")):
            with self.assertRaisesRegex(RuntimeError, "no remote authentication"):
                config.require_local_bind()
        with patch.object(config, "settings", replace(
                config.settings, host="127.0.0.1")):
            config.require_local_bind()

    def test_worker_reload_overrides_owned_values_only(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text(
                "DASHSCOPE_REGION=beijing\nUNRELATED_SETTING=keep\n")
            with patch.object(runtime_environment, "ENV_FILE", env_file), \
                    patch.dict(os.environ, {
                        "DASHSCOPE_REGION": "intl", "UNRELATED_SETTING": "original",
                    }, clear=False):
                runtime_environment.reload_owned_environment()
                self.assertEqual(os.environ["DASHSCOPE_REGION"], "beijing")
                self.assertEqual(os.environ["UNRELATED_SETTING"], "original")

    def test_worker_reload_changes_the_next_endpoint_resolution(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text(
                "DASHSCOPE_REGION=beijing\n"
                "DASHSCOPE_WORKSPACE_ID=worker-space\n"
            )
            with patch.object(runtime_environment, "ENV_FILE", env_file), \
                    patch.dict(os.environ, {
                        "DASHSCOPE_REGION": "intl",
                        "DASHSCOPE_WORKSPACE_ID": "",
                    }, clear=False):
                runtime_environment.reload_owned_environment()
                self.assertEqual(
                    alibaba_config.http_base(),
                    "https://worker-space.cn-beijing.maas.aliyuncs.com/api/v1",
                )

    def test_worker_reload_refreshes_the_imported_sdk_process_state(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text(
                "DASHSCOPE_REGION=intl\nDASHSCOPE_API_KEY=refreshed-key\n"
            )
            with patch.object(runtime_environment, "ENV_FILE", env_file), \
                    patch.object(sdk_runtime.dashscope, "api_key", None), \
                    patch.object(
                        sdk_runtime.dashscope, "base_http_api_url", "old"
                    ):
                runtime_environment.reload_owned_environment()
                self.assertEqual(sdk_runtime.dashscope.api_key, "refreshed-key")
                self.assertEqual(
                    sdk_runtime.dashscope.base_http_api_url,
                    "https://dashscope-intl.aliyuncs.com/api/v1",
                )

    def test_admin_rejects_newline_injection(self):
        with self.assertRaisesRegex(ValueError, "line breaks"):
            administration._write_environment({
                "RUSTFS_ENDPOINT": "https://safe.test\nDASHSCOPE_API_KEY=bad"
            })


if __name__ == "__main__":
    unittest.main()
