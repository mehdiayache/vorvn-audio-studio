"""Upload orchestration tests with no database, S3 or provider calls."""

from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest
from unittest.mock import AsyncMock, Mock, patch
from urllib.parse import quote

from audio_studio.application.uploads import UploadError, UploadService
from audio_studio.domain.uploads import StoredAsset, StoredVoiceReference
from audio_studio.http.errors import ApiProblem
from audio_studio.http.routers import uploads as upload_router


class FakeWorkspace:
    def __init__(self, *, storage_ready=True):
        self.storage_ready = storage_ready
        self.images = []
        self.references = []
        self.discarded_references = []
        self.assets = []
        self.discarded_media = []
        self.transcriptions = []
        self.voice_duration_ms = 15_000
        self.stored_asset = StoredAsset(
            "asset_fixture.mp3", "/media/asset_fixture.mp3", 1250,
            "mp3", "audio/mpeg", 48000, 2,
            {"codec": "mp3", "container": "mp3"})

    def store_image(self, raw, original_name):
        self.images.append((raw, original_name))
        return "/icon/stable.png"

    def store_voice_reference(self, raw, original_name, reference_id):
        self.references.append((raw, original_name, reference_id))
        return StoredVoiceReference(
            "normalized-24k.wav", f"{reference_id}/original.mp3",
            f"{reference_id}/normalized-24k.wav",
            duration_ms=self.voice_duration_ms, sample_rate=24_000,
            channels=1)

    def discard_voice_reference(self, reference_id):
        self.discarded_references.append(reference_id)

    def store_asset(self, source, *, original_name, size_bytes):
        self.assets.append((source, original_name, size_bytes))
        return self.stored_asset

    def discard_media(self, filename):
        self.discarded_media.append(filename)

    def reference_storage_ready(self):
        return self.storage_ready

    def store_transcription_source(
            self, source, *, original_name, size_bytes, upload_id):
        self.transcriptions.append(
            (source, original_name, size_bytes, upload_id))
        return {"url": "https://signed.test/source", "name": "source.mp3",
                "playable": "/inbox/source.mp3", "size_bytes": size_bytes,
                "duration_ms": 2200}


class FakeRecords:
    def __init__(self):
        self.references = []
        self.created_assets = []
        self.collection = {"id": 41}
        self.fail_reference = False
        self.fail_asset = False
        self.generated_duplicate = False

    def create_voice_reference(self, **values):
        if self.fail_reference:
            raise RuntimeError("database unavailable")
        self.references.append(values)
        return values["reference_id"]

    def asset_collection(self, collection_id):
        return self.collection if collection_id == 41 else None

    def create_uploaded_asset(
            self, collection_id, *, name, stored, size_bytes, category=None,
            scope="venture", tags=(), metadata=None):
        if self.fail_asset:
            raise RuntimeError("database unavailable")
        self.created_assets.append({
            "collection_id": collection_id, "name": name,
            "stored": stored, "size_bytes": size_bytes,
            "category": category, "scope": scope, "tags": tags,
            "metadata": metadata,
        })
        return {"id": 7, "version_id": 8, "name": name,
                "filename": stored.filename,
                "duration_ms": stored.duration_ms,
                "category": category or "music", "scope": scope,
                "tags": list(tags), "metadata": metadata or {},
                "media_type": stored.media_type,
                "media_format": stored.media_format or stored.audio_format,
                "audio_format": stored.audio_format,
                "sample_rate": stored.sample_rate,
                "channels": stored.channels, "width": stored.width,
                "height": stored.height,
                "video_codec": stored.video_codec,
                "frame_rate": stored.frame_rate, "size_bytes": size_bytes,
                "mime_type": stored.mime_type,
                "version_metadata": stored.metadata or {},
                "created_at": "2026-08-26T00:00:00+00:00",
                "updated_at": "2026-08-26T00:00:00+00:00"}

    def create_generated_asset(self, collection_id, **values):
        asset = self.create_uploaded_asset(collection_id, **{
            key: value for key, value in values.items()
            if key != "candidate_id"
        })
        return asset, self.generated_duplicate


class UploadServiceTests(unittest.TestCase):
    def service(self, *, storage_ready=True):
        workspace = FakeWorkspace(storage_ready=storage_ready)
        records = FakeRecords()
        return UploadService(workspace, records), workspace, records

    def test_image_rules_run_before_storage(self):
        service, workspace, _ = self.service()
        with self.assertRaisesRegex(UploadError, "PNG"):
            service.save_image(b"image", "unsafe.svg")
        self.assertFalse(workspace.images)
        self.assertEqual(
            service.save_image(b"image", "../cover.png"),
            {"url": "/icon/stable.png"},
        )
        self.assertEqual(workspace.images[0][1], "cover.png")

    def test_voice_reference_uses_a_stable_id_and_rolls_back_on_db_failure(self):
        service, workspace, records = self.service()
        result = service.save_voice_reference(
            b"audio", "voice.mp3", source_language="AR",
            transcript="  words spoken  ",
            metadata={"source": "recovered_generation", "job_id": 148},
        )
        reference_id = result["reference_id"]
        self.assertTrue(reference_id.startswith("ref_"))
        self.assertEqual(records.references[0]["reference_id"], reference_id)
        self.assertEqual(records.references[0]["source_language"], "ar")
        self.assertEqual(records.references[0]["transcript"], "words spoken")
        self.assertEqual(records.references[0]["metadata"]["job_id"], 148)
        self.assertEqual(result["duration_ms"], 15_000)
        self.assertEqual(result["sample_rate"], 24_000)
        self.assertEqual(result["channels"], 1)
        records.fail_reference = True
        with self.assertRaisesRegex(RuntimeError, "database"):
            service.save_voice_reference(b"audio", "second.mp3")
        self.assertEqual(len(workspace.discarded_references), 1)

    def test_voice_reference_accepts_a_long_master_but_keeps_a_hard_ceiling(self):
        service, workspace, records = self.service()
        workspace.voice_duration_ms = 4_999
        with self.assertRaisesRegex(UploadError, "at least 5 seconds"):
            service.save_voice_reference(b"audio", "short.wav")
        self.assertFalse(records.references)
        self.assertEqual(len(workspace.discarded_references), 1)

        workspace.voice_duration_ms = 180_000
        result = service.save_voice_reference(b"audio", "long.wav")
        self.assertEqual(result["duration_ms"], 180_000)
        self.assertEqual(len(records.references), 1)

        workspace.voice_duration_ms = 600_001
        with self.assertRaisesRegex(UploadError, "over 10 minutes"):
            service.save_voice_reference(b"audio", "too-long.wav")
        self.assertEqual(len(records.references), 1)
        self.assertEqual(len(workspace.discarded_references), 2)

    def test_asset_record_failure_removes_the_new_media_object(self):
        service, workspace, records = self.service()
        with TemporaryDirectory() as directory:
            source = Path(directory) / "incoming"
            source.write_bytes(b"audio")
            result = service.save_asset_file(
                41, source, source.stat().st_size, "Quiet bed.mp3")
        self.assertEqual(result["url"], "/audio/asset_fixture.mp3")
        self.assertEqual(result["name"], "Quiet bed")
        records.fail_asset = True
        with TemporaryDirectory() as directory:
            source = Path(directory) / "incoming"
            source.write_bytes(b"audio")
            with self.assertRaisesRegex(RuntimeError, "database"):
                service.save_asset_file(
                    41, source, source.stat().st_size, "Second.mp3")
        self.assertEqual(workspace.discarded_media, ["asset_fixture.mp3"])

    def test_visual_asset_uses_the_same_ingestion_path_and_generic_url(self):
        service, workspace, records = self.service()
        workspace.stored_asset = StoredAsset(
            filename="visual_fixture.png", path="/media/visual_fixture.png",
            duration_ms=None, audio_format=None, mime_type="image/png",
            media_type="image", media_format="png", width=1280, height=720,
            metadata={"codec": "png", "container": "image2"},
        )
        with TemporaryDirectory() as directory:
            source = Path(directory) / "incoming"
            source.write_bytes(b"image")
            result = service.save_asset_file(
                41, source, source.stat().st_size, "Story frame.png",
                name="Story frame",
            )

        self.assertEqual(result["url"], "/media/visual_fixture.png")
        self.assertEqual(result["media_type"], "image")
        self.assertEqual((result["width"], result["height"]), (1280, 720))
        self.assertEqual(records.created_assets[0]["stored"].media_type, "image")

    def test_visual_asset_rejects_an_audio_only_classification(self):
        service, workspace, records = self.service()
        workspace.stored_asset = StoredAsset(
            filename="visual_fixture.mp4", path="/media/visual_fixture.mp4",
            duration_ms=2_000, audio_format=None, mime_type="video/mp4",
            media_type="video", media_format="mp4", width=1920, height=1080,
            video_codec="h264", frame_rate=24,
        )
        with TemporaryDirectory() as directory:
            source = Path(directory) / "incoming"
            source.write_bytes(b"video")
            with self.assertRaisesRegex(UploadError, "apply only to audio"):
                service.save_asset_file(
                    41, source, source.stat().st_size, "Scene.mp4",
                    category="music",
                )

        self.assertFalse(records.created_assets)
        self.assertEqual(workspace.discarded_media, ["visual_fixture.mp4"])

    def test_generated_duplicate_removes_only_the_losing_media_object(self):
        service, workspace, records = self.service()
        records.generated_duplicate = True
        details = service.prepare_asset_upload(
            "candidate.wav", name="Rain candidate", category="sfx",
            scope="studio", metadata={"origin": "generated"},
        )
        with TemporaryDirectory() as directory:
            source = Path(directory) / "candidate.wav"
            source.write_bytes(b"generated audio")
            result = service.save_generated_asset_file(
                41, source, source.stat().st_size,
                candidate_id="candidate-1", details=details,
            )

        self.assertTrue(result["duplicate"])
        self.assertEqual(result["asset"]["name"], "Rain candidate")
        self.assertEqual(workspace.discarded_media, ["asset_fixture.mp3"])

    def test_asset_category_is_explicit_and_validated_before_storage(self):
        service, workspace, records = self.service()
        with TemporaryDirectory() as directory:
            source = Path(directory) / "incoming"
            source.write_bytes(b"audio")
            service.save_asset_file(
                41, source, source.stat().st_size, "Rain.wav",
                category="AMBIENCE",
            )
            with self.assertRaisesRegex(UploadError, "valid audio category"):
                service.save_asset_file(
                    41, source, source.stat().st_size, "Unknown.wav",
                    category="weather",
                )
        self.assertEqual(records.created_assets[0]["category"], "ambience")
        self.assertEqual(len(workspace.assets), 1)

    def test_asset_human_facts_are_normalized_before_storage(self):
        service, workspace, records = self.service()
        details = service.prepare_asset_upload(
            "Night_Room.wav", name="  Night   room ambience  ",
            category="Ambience", scope="studio",
            encoded_tags="%5B%22Night%22%2C%22%20night%20%22%2C%22Room%20Tone%22%5D",
        )
        self.assertEqual(details.name, "Night room ambience")
        self.assertEqual(details.tags, ("night", "room tone"))
        self.assertEqual(details.scope, "studio")
        self.assertEqual(details.metadata, {
            "origin": "upload", "original_filename": "Night_Room.wav",
        })
        self.assertFalse(workspace.assets)
        with self.assertRaisesRegex(UploadError, "at most 12"):
            service.prepare_asset_upload(
                "audio.wav", category="sfx",
                encoded_tags=quote(json.dumps(
                    [f"tag {index}" for index in range(13)])),
            )
        self.assertFalse(records.created_assets)

    def test_asset_explicit_name_scope_tags_and_technical_facts_survive(self):
        service, _, records = self.service()
        with TemporaryDirectory() as directory:
            source = Path(directory) / "incoming"
            source.write_bytes(b"audio")
            result = service.save_asset_file(
                41, source, source.stat().st_size, "source.wav",
                name="Door knock", category="sfx", scope="studio",
                encoded_tags="%5B%22wood%22%2C%22short%22%5D",
            )
        created = records.created_assets[0]
        self.assertEqual(
            (created["name"], created["scope"], created["tags"]),
            ("Door knock", "studio", ("wood", "short")),
        )
        self.assertEqual(result["sample_rate"], 48000)
        self.assertEqual(result["channels"], 2)

    def test_transcription_requires_storage_before_moving_the_file(self):
        service, workspace, _ = self.service(storage_ready=False)
        with TemporaryDirectory() as directory:
            source = Path(directory) / "incoming"
            source.write_bytes(b"audio")
            with self.assertRaises(UploadError) as raised:
                service.save_transcription_source_file(
                    source, source.stat().st_size, "source.mp3")
        self.assertTrue(raised.exception.needs_storage)
        self.assertFalse(workspace.transcriptions)


class UploadRouterCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_asset_upload_removes_incoming_file_when_application_rejects_it(self):
        with TemporaryDirectory() as directory:
            incoming = Path(directory) / "incoming.upload"
            incoming.write_bytes(b"invalid")
            service = Mock()
            service.prepare_asset_upload.return_value = Mock()
            service.save_asset_file.side_effect = UploadError("Rejected")
            with patch.object(upload_router, "upload_service", service), patch.object(
                    upload_router, "_stream_to_file",
                    AsyncMock(return_value=(incoming, incoming.stat().st_size))):
                with self.assertRaises(ApiProblem) as raised:
                    await upload_router.upload_venture_asset(
                        41, Mock(), x_filename="broken.wav")
            self.assertEqual((raised.exception.status, raised.exception.code),
                             (400, "invalid_asset"))
            self.assertFalse(incoming.exists())


if __name__ == "__main__":
    unittest.main()
