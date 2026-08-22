"""Upload orchestration tests with no database, S3 or provider calls."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from audio_studio.application.uploads import UploadError, UploadService
from audio_studio.domain.uploads import StoredAsset, StoredVoiceReference


class FakeWorkspace:
    def __init__(self, *, storage_ready=True):
        self.storage_ready = storage_ready
        self.images = []
        self.references = []
        self.discarded_references = []
        self.assets = []
        self.discarded_media = []
        self.transcriptions = []

    def store_image(self, raw, original_name):
        self.images.append((raw, original_name))
        return "/icon/stable.png"

    def store_voice_reference(self, raw, original_name, reference_id):
        self.references.append((raw, original_name, reference_id))
        return StoredVoiceReference(
            "normalized-24k.wav", f"{reference_id}/original.mp3",
            f"{reference_id}/normalized-24k.wav")

    def discard_voice_reference(self, reference_id):
        self.discarded_references.append(reference_id)

    def store_asset(self, source, *, original_name, size_bytes):
        self.assets.append((source, original_name, size_bytes))
        return StoredAsset(
            "asset_fixture.mp3", "/media/asset_fixture.mp3", 1250,
            "mp3", "audio/mpeg")

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

    def create_voice_reference(self, **values):
        if self.fail_reference:
            raise RuntimeError("database unavailable")
        self.references.append(values)
        return values["reference_id"]

    def asset_collection(self, collection_id):
        return self.collection if collection_id == 41 else None

    def create_uploaded_asset(
            self, collection_id, *, name, stored, size_bytes, category=None):
        if self.fail_asset:
            raise RuntimeError("database unavailable")
        self.created_assets.append({
            "collection_id": collection_id, "name": name,
            "stored": stored, "size_bytes": size_bytes,
            "category": category,
        })
        return {"id": 7, "filename": stored.filename,
                "duration_ms": stored.duration_ms}


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
        records.fail_reference = True
        with self.assertRaisesRegex(RuntimeError, "database"):
            service.save_voice_reference(b"audio", "second.mp3")
        self.assertEqual(len(workspace.discarded_references), 1)

    def test_asset_record_failure_removes_the_new_media_object(self):
        service, workspace, records = self.service()
        with TemporaryDirectory() as directory:
            source = Path(directory) / "incoming"
            source.write_bytes(b"audio")
            result = service.save_asset_file(
                41, source, source.stat().st_size, "Quiet bed.mp3")
        self.assertEqual(result["url"], "/audio/asset_fixture.mp3")
        self.assertEqual(result["name"], "Quiet bed.mp3")
        records.fail_asset = True
        with TemporaryDirectory() as directory:
            source = Path(directory) / "incoming"
            source.write_bytes(b"audio")
            with self.assertRaisesRegex(RuntimeError, "database"):
                service.save_asset_file(
                    41, source, source.stat().st_size, "Second.mp3")
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


if __name__ == "__main__":
    unittest.main()
