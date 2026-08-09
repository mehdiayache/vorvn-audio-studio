"""Object/local storage contracts. No network or provider calls."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

from audio_studio.infrastructure import object_storage as storage

from audio_studio.infrastructure.media_paths import contained


class StorageContracts(unittest.TestCase):
    def test_keys_are_stable_scoped_ids_not_user_filenames(self):
        with patch.dict("os.environ", {
            "RUSTFS_PREFIX": "audio-studio",
            "AUDIO_STUDIO_ORGANIZATION_ID": "local-studio",
        }):
            key = storage.object_key(
                kind="voice-references", object_id="ref_12345678",
                extension=".WAV")
        self.assertEqual(
            key,
            "audio-studio/v1/organizations/local-studio/objects/"
            "voice-references/ref_12345678/source.wav",
        )
        self.assertNotIn("../", key)

    def test_upload_is_private_checksummed_tagged_and_short_lived(self):
        client = Mock()
        client.generate_presigned_url.return_value = "https://signed.test/object"
        values = {
            "RUSTFS_ENDPOINT": "https://s3.test", "RUSTFS_ACCESS_KEY": "a",
            "RUSTFS_SECRET_KEY": "s", "RUSTFS_BUCKET": "bucket",
            "RUSTFS_PREFIX": "audio-studio",
            "RUSTFS_PUBLIC_URL": "https://public.example/ignored",
        }
        with TemporaryDirectory() as directory:
            path = Path(directory) / "human filename.wav"
            path.write_bytes(b"RIFF fixture")
            with patch.dict("os.environ", values), patch.object(
                    storage, "_client", return_value=client):
                url = storage.upload(
                    path, object_id="ref_12345678", kind="voice-references",
                    retention="durable")
        self.assertEqual(url, "https://signed.test/object")
        request = client.put_object.call_args.kwargs
        self.assertNotIn("human filename", request["Key"])
        self.assertEqual(request["Tagging"], "retention=durable")
        self.assertTrue(request["ChecksumSHA256"])
        self.assertEqual(
            client.generate_presigned_url.call_args.kwargs["ExpiresIn"], 900)

    def test_user_names_and_invalid_tenant_segments_cannot_enter_keys(self):
        with patch.dict("os.environ", {
            "RUSTFS_PREFIX": "audio-studio",
            "AUDIO_STUDIO_ORGANIZATION_ID": "../another-tenant",
        }):
            with self.assertRaisesRegex(ValueError, "ORGANIZATION"):
                storage.object_key(kind="voice-references",
                                   object_id="ref_12345678", extension="wav")

    def test_contained_path_rejects_escape(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(contained(root, "ref_123/file.wav"),
                             (root / "ref_123/file.wav").resolve())
            with self.assertRaisesRegex(RuntimeError, "invalid"):
                contained(root, "../secret")


if __name__ == "__main__":
    unittest.main()
