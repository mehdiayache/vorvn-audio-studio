"""Object/local storage contracts. No network or provider calls."""

from pathlib import Path
from tempfile import TemporaryDirectory
import base64
import subprocess
import unittest
from unittest.mock import Mock, patch

from audio_studio.infrastructure import object_storage as storage
from audio_studio.infrastructure import media_metadata, upload_workspace

from audio_studio.infrastructure.media_paths import contained
from audio_studio.infrastructure.upload_workspace import LocalUploadWorkspace
from audio_studio.infrastructure.voice_reference_workspace import VoiceReferenceWorkspace


class FakeObjects:
    def __init__(self):
        self.uploads = []

    @staticmethod
    def configured():
        return True

    def upload(self, path, **values):
        self.uploads.append((path, values))
        return "https://signed.test/source"

    def put(self, path, **values):
        self.uploads.append((path, values))
        return {"bucket": "private", "key": (
            "audio-studio/voice-references/ref_12345678/"
            f"{values.get('variant', 'source')}{Path(path).suffix}"),
            "sha256": __import__("hashlib").sha256(
                Path(path).read_bytes()).hexdigest(),
            "size_bytes": Path(path).stat().st_size}

    def download(self, *, bucket, key, target):
        self.downloaded = (bucket, key, Path(target))
        Path(target).parent.mkdir(parents=True, exist_ok=True)
        Path(target).write_bytes(b"durable master")
        return Path(target)


class StorageContracts(unittest.TestCase):
    def test_audio_inspection_reads_all_technical_facts_in_one_ffprobe_call(self):
        completed = Mock(returncode=0, stdout='''{
          "streams": [{"codec_type": "audio", "codec_name": "flac",
                       "sample_rate": "48000", "channels": 2}],
          "format": {"duration": "2.500", "format_name": "flac"}
        }''')
        with patch.object(media_metadata.shutil, "which",
                          return_value="/usr/bin/ffprobe"), patch.object(
                media_metadata.subprocess, "run", return_value=completed) as run:
            inspection = upload_workspace.inspect_audio(Path("source.flac"))
        self.assertEqual(run.call_count, 1)
        self.assertEqual(inspection, {
            "audio_format": "flac",
            "duration_ms": 2500, "sample_rate": 48000, "channels": 2,
            "metadata": {"codec": "flac", "container": "flac"},
        })

    def test_duration_consumers_reuse_the_unified_audio_inspection(self):
        with patch.object(upload_workspace, "inspect_audio", return_value={
                "duration_ms": 2750, "sample_rate": 48000, "channels": 2,
                "metadata": {}}) as inspect:
            duration_ms = upload_workspace._audio_duration_ms(
                Path("voice-reference.wav"))
        self.assertEqual(duration_ms, 2750)
        inspect.assert_called_once_with(Path("voice-reference.wav"))

    @unittest.skipUnless(
        upload_workspace.shutil.which("ffmpeg") and
        upload_workspace.shutil.which("ffprobe"),
        "FFmpeg and FFprobe are required",
    )
    def test_asset_format_extension_and_mime_follow_audio_truth(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            encoded = root / "actual.mp3"
            upload_workspace.subprocess.run([
                "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2",
                str(encoded),
            ], check=True)
            incoming = root / "incoming.upload"
            encoded.replace(incoming)
            workspace = LocalUploadWorkspace(
                root=root, output=root / "media",
                references=root / "references")

            stored = workspace.store_asset(
                incoming, original_name="deliberately-misnamed.wav",
                size_bytes=incoming.stat().st_size)

            self.assertEqual(stored.audio_format, "mp3")
            self.assertEqual(stored.mime_type, "audio/mpeg")
            self.assertTrue(stored.filename.endswith(".mp3"))
            self.assertEqual(stored.metadata["container"], "mp3")
            self.assertTrue(Path(stored.path).is_file())

    @unittest.skipUnless(
        upload_workspace.shutil.which("ffmpeg") and
        upload_workspace.shutil.which("ffprobe"),
        "FFmpeg and FFprobe are required",
    )
    def test_image_asset_uses_real_dimensions_and_visual_identity(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            encoded = root / "cover.png"
            subprocess.run([
                "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=blue:s=320x180",
                "-frames:v", "1", "-update", "1", str(encoded),
            ], check=True)
            incoming = root / "incoming.upload"
            encoded.replace(incoming)
            workspace = LocalUploadWorkspace(
                root=root, output=root / "media",
                references=root / "references")

            stored = workspace.store_asset(
                incoming, original_name="cover.png",
                size_bytes=incoming.stat().st_size)

            self.assertEqual(stored.family, "image")
            self.assertEqual(stored.media_format, "png")
            self.assertEqual(stored.mime_type, "image/png")
            self.assertEqual((stored.width, stored.height), (320, 180))
            self.assertIsNone(stored.duration_ms)
            self.assertTrue(stored.filename.endswith(".png"))

    @unittest.skipUnless(
        upload_workspace.shutil.which("ffmpeg") and
        upload_workspace.shutil.which("ffprobe"),
        "FFmpeg and FFprobe are required",
    )
    def test_video_asset_uses_real_duration_dimensions_codec_and_rate(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            encoded = root / "scene.mp4"
            subprocess.run([
                "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc=size=320x180:rate=24",
                "-t", "0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                str(encoded),
            ], check=True)
            incoming = root / "incoming.upload"
            encoded.replace(incoming)
            workspace = LocalUploadWorkspace(
                root=root, output=root / "media",
                references=root / "references")

            stored = workspace.store_asset(
                incoming, original_name="scene.mp4",
                size_bytes=incoming.stat().st_size)

            self.assertEqual(stored.family, "video")
            self.assertEqual(stored.media_format, "mp4")
            self.assertEqual(stored.mime_type, "video/mp4")
            self.assertEqual((stored.width, stored.height), (320, 180))
            self.assertEqual(stored.video_codec, "h264")
            self.assertAlmostEqual(stored.frame_rate or 0, 24, places=3)
            self.assertGreaterEqual(stored.duration_ms or 0, 450)
            self.assertTrue(stored.filename.endswith(".mp4"))

    @unittest.skipUnless(
        upload_workspace.shutil.which("ffmpeg") and
        upload_workspace.shutil.which("ffprobe"),
        "FFmpeg and FFprobe are required",
    )
    def test_declared_visual_formats_match_the_deployed_ffmpeg_runtime(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            image_cases = (("jpg", "mjpeg"), ("png", "png"))
            for extension, codec in image_cases:
                with self.subTest(extension=extension):
                    target = root / f"still.{extension}"
                    subprocess.run([
                        "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
                        "-f", "lavfi", "-i", "color=c=purple:s=160x90",
                        "-frames:v", "1", "-c:v", codec, "-update", "1",
                        str(target),
                    ], check=True)
                    inspection = media_metadata.inspect_media(
                        target, original_name=target.name)
                    self.assertIsNotNone(inspection)
                    self.assertEqual(inspection.media_type, "image")
                    self.assertEqual(inspection.media_format, extension)

            webp = root / "still.webp"
            webp.write_bytes(base64.b64decode(
                "UklGRjgAAABXRUJQVlA4ICwAAADQAQCdASoQABAAAgA0JaACdLoB+AADsAD+"
                "9j/f/jduMN+C7/zNExzH8QAAAA=="
            ))
            webp_inspection = media_metadata.inspect_media(
                webp, original_name=webp.name)
            self.assertIsNotNone(webp_inspection)
            self.assertEqual(webp_inspection.media_type, "image")
            self.assertEqual(webp_inspection.media_format, "webp")

            video_cases = (("mp4", "libx264"), ("mov", "libx264"),
                           ("webm", "libvpx"))
            for extension, codec in video_cases:
                with self.subTest(extension=extension):
                    target = root / f"motion.{extension}"
                    subprocess.run([
                        "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
                        "-f", "lavfi", "-i", "testsrc=size=160x90:rate=12",
                        "-t", "0.25", "-c:v", codec, "-pix_fmt", "yuv420p",
                        str(target),
                    ], check=True)
                    inspection = media_metadata.inspect_media(
                        target, original_name=target.name)
                    self.assertIsNotNone(inspection)
                    self.assertEqual(inspection.media_type, "video")
                    self.assertEqual(inspection.media_format, extension)

            video_with_audio = root / "motion-with-audio.mp4"
            subprocess.run([
                "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc=size=160x90:rate=12",
                "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
                "-t", "0.25", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-ac", "2", "-shortest", str(video_with_audio),
            ], check=True)
            video_audio_inspection = media_metadata.inspect_media(
                video_with_audio, original_name=video_with_audio.name)
            self.assertIsNotNone(video_audio_inspection)
            self.assertEqual(video_audio_inspection.media_type, "video")
            self.assertEqual(video_audio_inspection.sample_rate, 48_000)
            self.assertEqual(video_audio_inspection.channels, 2)
            self.assertEqual(
                video_audio_inspection.metadata["audio_codec"], "aac")

    def test_invalid_asset_audio_removes_the_moved_media_file(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "incoming.upload"
            source.write_bytes(b"not audio")
            output = root / "media"
            workspace = LocalUploadWorkspace(
                root=root, output=output, references=root / "references")
            with patch.object(upload_workspace, "inspect_media",
                              return_value=None):
                with self.assertRaisesRegex(ValueError, "supported audio"):
                    workspace.store_asset(
                        source, original_name="broken.wav", size_bytes=9)
            self.assertEqual(list(output.iterdir()), [])

    def test_direct_file_storage_keeps_a_document_as_a_document_version(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "incoming.upload"
            source.write_bytes(b"%PDF-1.4\nfixture")
            workspace = LocalUploadWorkspace(
                root=root, output=root / "media", references=root / "references")
            with patch.object(upload_workspace, "inspect_media", return_value=None):
                stored = workspace.store_file(
                    source, original_name="Campaign Brief.pdf",
                    size_bytes=source.stat().st_size)

            self.assertEqual(stored.family, "document")
            self.assertEqual(stored.mime_type, "application/pdf")
            self.assertEqual(stored.media_format, "pdf")
            self.assertTrue(Path(stored.path).read_bytes().startswith(b"%PDF"))

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

    def test_transcription_workspace_uses_stable_private_temporary_object(self):
        objects = FakeObjects()
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "incoming.upload"
            source.write_bytes(b"audio fixture")
            workspace = LocalUploadWorkspace(
                root=root, output=root / "media",
                references=root / "references", objects=objects)
            with patch.object(upload_workspace, "_audio_duration_ms",
                              return_value=1250):
                result = workspace.store_transcription_source(
                    source, original_name="Human title.mp3",
                    size_bytes=13, upload_id="upload_12345678")
            self.assertTrue((root / ".inbox" / result["name"]).is_file())
        values = objects.uploads[0][1]
        self.assertEqual(values["object_id"], "upload_12345678")
        self.assertEqual(values["kind"], "transcription-sources")
        self.assertEqual(values["retention"], "temporary")
        self.assertNotIn("Human title", objects.uploads[0][0])

    def test_voice_master_uses_a_durable_locator_and_keeps_a_local_cache(self):
        objects = FakeObjects()
        with TemporaryDirectory() as directory, patch.object(
                upload_workspace.shutil, "which", return_value=None):
            root = Path(directory)
            workspace = LocalUploadWorkspace(
                root=root, output=root / "media",
                references=root / "references", objects=objects)
            stored = workspace.store_voice_reference(
                b"durable master", "Human name.wav", "ref_12345678")
            self.assertTrue((root / "references" / stored.normalized_path).is_file())
        self.assertEqual(stored.storage_backend, "s3")
        self.assertEqual(stored.storage_bucket, "private")
        self.assertNotIn("Human name", stored.storage_key or "")
        self.assertEqual(len(objects.uploads), 2)
        self.assertEqual(
            {item[1]["variant"] for item in objects.uploads},
            {"original", "normalized"})
        self.assertTrue(stored.original_storage_key)
        self.assertTrue(stored.normalized_storage_key)
        self.assertEqual(stored.sha256, stored.normalized_sha256)
        self.assertTrue(all(item[1]["retention"] == "durable"
                            for item in objects.uploads))

    def test_s3_master_is_restored_and_checksum_verified_when_cache_is_missing(self):
        objects = FakeObjects()
        digest = __import__("hashlib").sha256(b"durable master").hexdigest()
        with TemporaryDirectory() as directory:
            workspace = VoiceReferenceWorkspace(Path(directory), objects=objects)
            resolved = workspace.resolve_reference({
                "normalized_path": "ref_12345678/normalized.wav",
                "storage_backend": "s3", "storage_bucket": "private",
                "storage_key": "safe/key.wav", "sha256": digest,
            })
            self.assertEqual(resolved.read_bytes(), b"durable master")
            self.assertEqual(objects.downloaded[:2], ("private", "safe/key.wav"))


if __name__ == "__main__":
    unittest.main()
