"""Infrastructure contracts for Settings persistence and safe maintenance."""

from __future__ import annotations

import os
from pathlib import Path
from tempfile import TemporaryDirectory
import time
import unittest
from unittest.mock import patch

from origins.infrastructure.settings_administration import (
    EnvironmentSettings,
    FilesystemMaintenance,
)
from origins.providers.freesound import FreesoundOAuthTokens


class SettingsAdministrationTests(unittest.TestCase):
    def test_kie_key_is_persisted_but_never_returned(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            env_file = root / ".env"
            administration = EnvironmentSettings(
                env_file=env_file, revision_file=root / ".revision",
                reload_environment=lambda: None,
            )
            with patch.dict(os.environ, {}, clear=True):
                administration.save_media_generation_provider({
                    "api_key": "private-kie-key",
                    "base_url": "https://api.kie.ai/",
                })
                status = administration.media_generation_provider()
            saved = env_file.read_text()
            self.assertIn("KIE_API_KEY=private-kie-key", saved)
            self.assertIn("KIE_API_BASE_URL=https://api.kie.ai", saved)
            self.assertTrue(status["configured"])
            self.assertNotIn("private-kie-key", repr(status))

    def test_audio_generation_key_is_persisted_but_never_returned(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            env_file = root / ".env"
            administration = EnvironmentSettings(
                env_file=env_file, revision_file=root / ".revision",
                reload_environment=lambda: None,
            )
            with patch.dict(os.environ, {}, clear=True):
                administration.save_audio_generation({
                    "api_key": "private-key",
                    "base_url": "https://audio.test/",
                })
                status = administration.audio_generation()
            saved = env_file.read_text()
            self.assertIn("VORVN_AI_API_KEY=private-key", saved)
            self.assertIn("VORVN_AI_BASE_URL=https://audio.test", saved)
            self.assertTrue(status["configured"])
            self.assertNotIn("private-key", repr(status))

    def test_freesound_secrets_are_persisted_but_never_returned(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            env_file = root / ".env"
            revision_file = root / ".revision"
            env_file.write_text("UNRELATED=keep\n")
            administration = EnvironmentSettings(
                env_file=env_file, revision_file=revision_file,
                reload_environment=lambda: None,
                freesound_exchange=lambda **_: FreesoundOAuthTokens(
                    "access-secret", "refresh-secret",
                    int(time.time()) + 3600),
            )
            with patch.dict(os.environ, {}, clear=True):
                administration.save_audio_catalog({
                    "api_token": "search-secret",
                    "client_id": "public-client",
                    "authorization_code": "one-time-code",
                })
                status = administration.audio_catalog()
            saved = env_file.read_text()
            self.assertIn("FREESOUND_API_TOKEN=search-secret", saved)
            self.assertIn("FREESOUND_CLIENT_ID=public-client", saved)
            self.assertIn(
                "FREESOUND_OAUTH_ACCESS_TOKEN=access-secret", saved)
            self.assertIn(
                "FREESOUND_OAUTH_REFRESH_TOKEN=refresh-secret", saved)
            self.assertTrue(status["search_configured"])
            self.assertTrue(status["keep_configured"])
            self.assertNotIn("search-secret", repr(status))
            self.assertNotIn("access-secret", repr(status))
            self.assertNotIn("refresh-secret", repr(status))

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
                    "origins.infrastructure.settings_administration."
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

    def test_changing_freesound_credentials_requires_fresh_authorization(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            env_file = root / ".env"
            env_file.write_text(
                "FREESOUND_API_TOKEN=old\nFREESOUND_CLIENT_ID=old-client\n"
                "FREESOUND_OAUTH_ACCESS_TOKEN=old-access\n"
                "FREESOUND_OAUTH_REFRESH_TOKEN=old-refresh\n"
                "FREESOUND_OAUTH_EXPIRES_AT=9999999999\n"
            )
            administration = EnvironmentSettings(
                env_file=env_file, revision_file=root / ".revision",
                reload_environment=lambda: None,
            )
            with patch.dict(os.environ, {
                    "FREESOUND_API_TOKEN": "old",
                    "FREESOUND_CLIENT_ID": "old-client",
                    "FREESOUND_OAUTH_ACCESS_TOKEN": "old-access",
                    "FREESOUND_OAUTH_REFRESH_TOKEN": "old-refresh",
                    "FREESOUND_OAUTH_EXPIRES_AT": "9999999999",
                    }, clear=True):
                administration.save_audio_catalog({
                    "client_id": "new-client", "api_token": "",
                    "authorization_code": "",
                })
                self.assertNotIn("FREESOUND_OAUTH_ACCESS_TOKEN", os.environ)
                self.assertNotIn("FREESOUND_OAUTH_REFRESH_TOKEN", os.environ)
            saved = env_file.read_text()
            self.assertIn("FREESOUND_CLIENT_ID=new-client", saved)
            self.assertNotIn("FREESOUND_OAUTH_ACCESS_TOKEN", saved)
            self.assertNotIn("FREESOUND_OAUTH_REFRESH_TOKEN", saved)

    def test_tidy_removes_only_scratch_and_never_voice_masters(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "out"
            voice_references = root / ".media" / "voice-references"
            scratch = root / ".incoming" / "partial.wav"
            durable_master = voice_references / "ref_123" / "normalized.wav"
            finished = output / "finished.mp3"
            for path in (scratch, durable_master, finished):
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
            self.assertTrue(durable_master.exists())
            self.assertTrue(finished.exists())
            snapshot = maintenance.snapshot()
            self.assertEqual(snapshot["finished"]["files"], 1)
            self.assertEqual(snapshot["protected_total"], 5)


if __name__ == "__main__":
    unittest.main()
