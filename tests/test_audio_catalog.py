"""Focused Freesound Search and Keep contracts."""

from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch
import urllib.parse

from audio_studio.application.audio_catalog import AudioCatalogService
from audio_studio.application.uploads import UploadService
from audio_studio.domain.audio_catalog import (
    AudioCatalogError,
    CatalogDownload,
    CatalogSound,
)
from audio_studio.domain.uploads import StoredAsset
from audio_studio.providers.freesound import FreesoundCatalog


class Response:
    def __init__(self, payload: object, headers: dict | None = None):
        self.payload = (payload if isinstance(payload, bytes) else
                        json.dumps(payload).encode())
        self.headers = headers or {}
        self.offset = 0

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, size: int = -1):
        if size < 0:
            return self.payload
        chunk = self.payload[self.offset:self.offset + size]
        self.offset += len(chunk)
        return chunk


def raw_sound(license_name: str = "Creative Commons 0") -> dict:
    return {
        "id": 931, "name": "Wooden door close.wav", "duration": 2.4,
        "username": "fieldrecorder", "license": license_name,
        "tags": ["door", "wood", "close"], "type": "wav",
        "url": "https://freesound.org/s/931/",
        "previews": {
            "preview-hq-mp3": "https://cdn.freesound.org/preview.mp3"},
    }


class FreesoundProviderTests(unittest.TestCase):
    def test_status_requires_both_credentials_for_complete_keep(self):
        states = (
            ({}, False, False),
            ({"FREESOUND_API_TOKEN": "search"}, True, False),
            ({"FREESOUND_OAUTH_ACCESS_TOKEN": "download"}, False, False),
            ({"FREESOUND_API_TOKEN": "search",
              "FREESOUND_OAUTH_ACCESS_TOKEN": "download"}, True, True),
        )
        for environment, search_ready, keep_ready in states:
            with self.subTest(environment=environment), patch.dict(
                    "os.environ", environment, clear=True):
                self.assertEqual(FreesoundCatalog.status(), {
                    "search_configured": search_ready,
                    "keep_configured": keep_ready,
                })

    def test_search_maps_query_filters_and_all_supported_licenses(self):
        opener = Mock(return_value=Response({"results": [
            raw_sound(), raw_sound("Attribution"),
            raw_sound("Attribution NonCommercial"),
        ]}))
        with patch.dict(
                "os.environ", {"FREESOUND_API_TOKEN": "search-token"}):
            sounds = FreesoundCatalog(opener=opener).search(
                "wooden door closing", license_filter="all",
                duration_min=1, duration_max=30)

        request = opener.call_args.args[0]
        query = urllib.parse.parse_qs(
            urllib.parse.urlparse(request.full_url).query)
        self.assertEqual(query["query"], ["wooden door closing"])
        self.assertIn("duration:[1 TO 30]", query["filter"][0])
        self.assertIn("Attribution NonCommercial", query["filter"][0])
        self.assertEqual(request.headers["Authorization"], "Token search-token")
        self.assertEqual([item.license for item in sounds],
                         ["cc0", "cc-by", "cc-by-nc"])
        self.assertFalse(sounds[0].attribution_required)
        self.assertTrue(sounds[1].attribution_required)
        self.assertIn("fieldrecorder", sounds[1].attribution_text)
        self.assertIn("CC BY-NC", sounds[2].attribution_text)

    def test_search_failure_is_explicit(self):
        opener = Mock(side_effect=OSError("offline"))
        with patch.dict(
                "os.environ", {"FREESOUND_API_TOKEN": "token"}):
            with self.assertRaisesRegex(AudioCatalogError, "could not be reached"):
                FreesoundCatalog(opener=opener).search("rain room ambience")

    def test_original_download_uses_oauth_bearer_without_using_preview(self):
        opener = Mock(return_value=Response(b"RIFF-original", {
            "Content-Length": "13"}))
        sound = FakeCatalog.sound_record
        with TemporaryDirectory() as directory, patch.dict(
                "os.environ", {"FREESOUND_OAUTH_ACCESS_TOKEN": "oauth"}):
            target = Path(directory) / "source.download"
            downloaded = FreesoundCatalog(opener=opener).download(
                sound, target)
        request = opener.call_args.args[0]
        self.assertEqual(request.headers["Authorization"], "Bearer oauth")
        self.assertIn("/sounds/931/download/", request.full_url)
        self.assertEqual(downloaded.original_name, sound.name)


class FakeWorkspace:
    def __init__(self):
        self.stored = []
        self.discarded = []

    def store_asset(self, source, *, original_name, size_bytes):
        self.stored.append((Path(source), original_name, size_bytes))
        return StoredAsset(
            "kept.wav", "/media/kept.wav", 2400, "wav", "audio/wav",
            48000, 2, {"codec": "pcm_s16le", "container": "wav"})

    def discard_media(self, filename):
        self.discarded.append(filename)


class FakeRecords:
    def __init__(self):
        self.created = []
        self.existing = None
        self.competing_existing = None
        self.fail_create = False

    def asset_collection(self, collection_id):
        return {"id": collection_id} if collection_id == 41 else None

    def catalog_asset(self, collection_id, *, origin, external_id, scope):
        return self.existing

    def create_uploaded_asset(self, collection_id, **values):
        if self.fail_create:
            raise RuntimeError("database unavailable")
        self.created.append({"collection_id": collection_id, **values})
        stored = values["stored"]
        return {
            "id": 7, "version_id": 8, "name": values["name"],
            "filename": stored.filename, "duration_ms": stored.duration_ms,
            "category": values["category"], "scope": values["scope"],
            "tags": list(values["tags"]), "metadata": values["metadata"],
            "audio_format": stored.audio_format,
            "sample_rate": stored.sample_rate, "channels": stored.channels,
            "size_bytes": values["size_bytes"],
            "mime_type": stored.mime_type,
            "version_metadata": stored.metadata,
        }

    def create_catalog_asset(
            self, collection_id, *, origin, external_id, **values):
        if self.fail_create:
            raise RuntimeError("database unavailable")
        if self.competing_existing:
            return self.competing_existing, True
        return self.create_uploaded_asset(collection_id, **values), False


class FakeCatalog:
    sound_record = CatalogSound(
        external_id="931", name="Wooden door close.wav", duration_ms=2400,
        creator="fieldrecorder", license="cc-by-nc",
        license_url="https://creativecommons.org/licenses/by-nc/4.0/",
        source_url="https://freesound.org/s/931/",
        preview_url="https://cdn.freesound.org/preview.mp3",
        original_format="wav", tags=("door", "wood", "close"),
    )

    def __init__(self, fail_download=False):
        self.downloads = 0
        self.fail_download = fail_download

    def status(self):
        return {"search_configured": True, "keep_configured": True}

    def search(self, *_args, **_kwargs):
        return [self.sound_record]

    def sound(self, external_id):
        if external_id != "931":
            raise AudioCatalogError("missing")
        return self.sound_record

    def download(self, sound, target):
        self.downloads += 1
        target.write_bytes(b"RIFF-source")
        if self.fail_download:
            raise AudioCatalogError("download failed")
        return CatalogDownload(
            str(target), sound.name, target.stat().st_size)


class AudioCatalogApplicationTests(unittest.TestCase):
    def service(self, root: Path, *, fail_download=False):
        workspace = FakeWorkspace()
        records = FakeRecords()
        catalog = FakeCatalog(fail_download=fail_download)
        uploads = UploadService(workspace, records)
        service = AudioCatalogService(
            catalog=catalog, uploads=uploads,
            scratch_root=root / "incoming")
        return service, catalog, workspace, records

    def test_preview_search_never_creates_an_asset(self):
        with TemporaryDirectory() as directory:
            service, _, workspace, records = self.service(Path(directory))
            results = service.search("wooden door closing")
        self.assertEqual(results[0]["preview_url"],
                         "https://cdn.freesound.org/preview.mp3")
        self.assertFalse(workspace.stored)
        self.assertFalse(records.created)

    def test_keep_reuses_ingestion_and_persists_provenance_category_scope(self):
        with TemporaryDirectory() as directory:
            service, catalog, workspace, records = self.service(Path(directory))
            result = service.keep(
                collection_id=41, external_id="931",
                name="Heavy wooden door", category="ambience",
                scope="studio", tags=("door", "interior"))

        self.assertFalse(result["duplicate"])
        self.assertEqual(catalog.downloads, 1)
        self.assertEqual(len(workspace.stored), 1)
        created = records.created[0]
        self.assertEqual((created["category"], created["scope"]),
                         ("ambience", "studio"))
        self.assertEqual(created["tags"], ("door", "interior"))
        self.assertEqual(created["metadata"]["origin"], "freesound")
        self.assertEqual(created["metadata"]["external_id"], "931")
        self.assertEqual(created["metadata"]["license"], "cc-by-nc")
        self.assertTrue(created["metadata"]["attribution_required"])
        self.assertEqual(result["asset"]["version_id"], 8)

    def test_duplicate_keep_returns_the_existing_asset_without_download(self):
        with TemporaryDirectory() as directory:
            service, catalog, workspace, records = self.service(Path(directory))
            records.existing = {"id": 17, "version_id": 22}
            result = service.keep(
                collection_id=41, external_id="931", name="Door",
                category="sfx", scope="studio", tags=())
        self.assertTrue(result["duplicate"])
        self.assertEqual(result["asset"]["id"], 17)
        self.assertEqual(catalog.downloads, 0)
        self.assertFalse(workspace.stored)

    def test_concurrent_loser_reuses_winner_and_discards_its_stored_media(self):
        with TemporaryDirectory() as directory:
            service, catalog, workspace, records = self.service(Path(directory))
            records.competing_existing = {
                "id": 17, "version_id": 22, "filename": "winner.wav",
                "url": "/audio/winner.wav",
            }
            result = service.keep(
                collection_id=41, external_id="931", name="Door",
                category="sfx", scope="studio", tags=())
        self.assertTrue(result["duplicate"])
        self.assertEqual(result["asset"]["id"], 17)
        self.assertEqual(catalog.downloads, 1)
        self.assertFalse(records.created)
        self.assertEqual(workspace.discarded, ["kept.wav"])

    def test_download_failure_leaves_no_asset_or_scratch_file(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            service, _, workspace, records = self.service(
                root, fail_download=True)
            with self.assertRaisesRegex(AudioCatalogError, "download failed"):
                service.keep(
                    collection_id=41, external_id="931", name="Door",
                    category="sfx", scope="venture", tags=())
            remaining = list((root / "incoming").rglob("*"))
        self.assertFalse(workspace.stored)
        self.assertFalse(records.created)
        self.assertFalse(remaining)

    def test_asset_write_failure_discards_the_stored_original(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            service, _, workspace, records = self.service(root)
            records.fail_create = True
            with self.assertRaisesRegex(RuntimeError, "database unavailable"):
                service.keep(
                    collection_id=41, external_id="931", name="Door",
                    category="other", scope="studio", tags=())
            remaining = list((root / "incoming").rglob("*"))
        self.assertEqual(workspace.discarded, ["kept.wav"])
        self.assertFalse(records.created)
        self.assertFalse(remaining)


if __name__ == "__main__":
    unittest.main()
