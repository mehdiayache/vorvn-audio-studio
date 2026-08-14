"""Runtime configuration refresh and validation contracts."""

from pathlib import Path
from tempfile import TemporaryDirectory
import os
import unittest
from unittest.mock import patch
from unittest.mock import Mock

from audio_studio import runtime
from audio_studio.infrastructure import runtime_environment
from audio_studio.providers.alibaba import config as alibaba_config
from audio_studio.providers.alibaba import sdk_runtime
from audio_studio.infrastructure.settings_administration import EnvironmentSettings
from audio_studio.composition.runtime_configuration import configured_api_environment
from audio_studio import config
from dataclasses import replace


class RuntimeEnvironmentTests(unittest.TestCase):
    def test_supervisor_passes_one_runtime_identity_to_its_worker(self):
        supervisor = runtime.WorkerSupervisor("runtime-test", 1234)
        process = Mock()
        with patch.object(runtime.subprocess, "Popen", return_value=process) as spawn:
            self.assertIs(supervisor._spawn(), process)
        environment = spawn.call_args.kwargs["env"]
        self.assertEqual(environment["AUDIO_STUDIO_RUNTIME_ID"], "runtime-test")
        self.assertEqual(environment["AUDIO_STUDIO_PARENT_PID"], "1234")

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

    def test_api_environment_restores_the_calling_process(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text(
                "DASHSCOPE_REGION=beijing\nDASHSCOPE_API_KEY=api-key\n"
            )
            with patch.object(runtime_environment, "ENV_FILE", env_file), \
                    patch.dict(os.environ, {
                        "DASHSCOPE_REGION": "intl",
                        "DASHSCOPE_API_KEY": "test-key",
                    }, clear=False):
                with configured_api_environment():
                    self.assertEqual(os.environ["DASHSCOPE_REGION"], "beijing")
                    self.assertEqual(os.environ["DASHSCOPE_API_KEY"], "api-key")
                self.assertEqual(os.environ["DASHSCOPE_REGION"], "intl")
                self.assertEqual(os.environ["DASHSCOPE_API_KEY"], "test-key")

    def test_composition_root_loads_persisted_settings_before_startup(self):
        order = []
        with patch.object(
                runtime, "reload_owned_environment",
                side_effect=lambda: order.append("environment")), \
                patch.object(
                    runtime, "require_local_bind",
                    side_effect=lambda: order.append("bind")), \
                patch.object(runtime, "run_migrations", side_effect=RuntimeError("stop")):
            with self.assertRaisesRegex(RuntimeError, "stop"):
                runtime.main()
        self.assertEqual(order, ["environment", "bind"])

    def test_admin_rejects_newline_injection(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            administration = EnvironmentSettings(
                env_file=root / ".env", revision_file=root / ".revision")
            with self.assertRaisesRegex(ValueError, "line breaks"):
                administration._write_environment({
                    "RUSTFS_ENDPOINT":
                        "https://safe.test\nDASHSCOPE_API_KEY=bad"
                })


if __name__ == "__main__":
    unittest.main()
