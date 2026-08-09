"""Runtime configuration refresh and validation contracts."""

from pathlib import Path
from tempfile import TemporaryDirectory
import os
import unittest
from unittest.mock import patch

from audio_studio.application import administration
from audio_studio.infrastructure import runtime_environment
from audio_studio import config
from dataclasses import replace


class RuntimeEnvironmentTests(unittest.TestCase):
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

    def test_admin_rejects_newline_injection(self):
        with self.assertRaisesRegex(ValueError, "line breaks"):
            administration._write_environment({
                "RUSTFS_ENDPOINT": "https://safe.test\nDASHSCOPE_API_KEY=bad"
            })


if __name__ == "__main__":
    unittest.main()
