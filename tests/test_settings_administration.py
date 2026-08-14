"""Infrastructure contracts for Settings persistence and safe maintenance."""

from __future__ import annotations

import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from audio_studio.infrastructure.settings_administration import (
    EnvironmentSettings,
    FilesystemMaintenance,
)


class SettingsAdministrationTests(unittest.TestCase):
    def test_blank_secret_fields_preserve_existing_storage_credentials(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            env_file = root / ".env"
            revision_file = root / ".revision"
            env_file.write_text(
                "UNRELATED=keep\nRUSTFS_ACCESS_KEY=existing-access\n"
                "RUSTFS_SECRET_KEY=existing-secret\n"
            )
            reloads = []
            administration = EnvironmentSettings(
                env_file=env_file, revision_file=revision_file,
                reload_environment=lambda: reloads.append(True),
            )
            current = {
                "endpoint": "https://old.test", "bucket": "old-bucket",
                "prefix": "audio", "region": "us-east-1",
                "access_key": "existing-access",
                "secret_key": "existing-secret",
            }
            with patch(
                    "audio_studio.infrastructure.settings_administration."
                    "object_storage.settings", return_value=current):
                administration.save_storage({
                    "endpoint": "https://new.test", "bucket": "new-bucket",
                    "prefix": "audio", "region": "us-east-1",
                    "access_key": "", "secret_key": "",
                })
            saved = env_file.read_text()
            self.assertIn("UNRELATED=keep", saved)
            self.assertIn("RUSTFS_ACCESS_KEY=existing-access", saved)
            self.assertIn("RUSTFS_SECRET_KEY=existing-secret", saved)
            self.assertIn("RUSTFS_ENDPOINT=https://new.test", saved)
            self.assertEqual(reloads, [True])
            self.assertTrue(revision_file.exists())

    def test_tidy_removes_only_scratch_and_never_voice_masters(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "out"
            voice_references = root / ".media" / "voice-references"
            scratch = root / ".incoming" / "partial.wav"
            legacy_master = root / ".uploads" / "original.wav"
            durable_master = voice_references / "ref_123" / "normalized.wav"
            finished = output / "finished.mp3"
            for path in (scratch, legacy_master, durable_master, finished):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"audio")
                os.utime(path, (1, 1))
            maintenance = FilesystemMaintenance(
                root=root, output=lambda: output,
                voice_references=lambda: voice_references,
            )
            result = maintenance.tidy(days=0)
            self.assertEqual(result, {"removed": 1, "freed": 5})
            self.assertFalse(scratch.exists())
            self.assertTrue(legacy_master.exists())
            self.assertTrue(durable_master.exists())
            self.assertTrue(finished.exists())
            snapshot = maintenance.snapshot()
            self.assertEqual(snapshot["finished"]["files"], 1)
            self.assertEqual(snapshot["protected_total"], 10)


if __name__ == "__main__":
    unittest.main()
