"""Focused Freesound Search and Keep contracts."""

from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch
import urllib.parse

from origins.application.audio_catalog import AudioCatalogService
from origins.application.uploads import UploadService
from origins.domain.audio_catalog import (
    AudioCatalogError,
    CatalogDownload,
    CatalogSound,
)
from origins.domain.files import StoredFileVersion
from origins.providers.freesound import (
    FreesoundCatalog,
    FreesoundOAuthTokens,
    freesound_status,
)


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
            ({"FREESOUND_API_TOKEN": "search",
              "FREESOUND_CLIENT_ID": "client"}, True, False),
            ({"FREESOUND_API_TOKEN": "search",
              "FREESOUND_CLIENT_ID": "client",
              "FREESOUND_OAUTH_ACCESS_TOKEN": "download",
              "FREESOUND_OAUTH_EXPIRES_AT": "2000"}, True, True),
            ({"FREESOUND_API_TOKEN": "search",
              "FREESOUND_CLIENT_ID": "client",
              "FREESOUND_OAUTH_REFRESH_TOKEN": "refresh"}, True, True),
        )
        for environment, search_ready, keep_ready in states:
            with self.subTest(environment=environment), patch.dict(
                    "os.environ", environment, clear=True):
                status = freesound_status(now=1000)
                self.assertEqual(status["search_configured"], search_ready)
                self.assertEqual(status["keep_configured"], keep_ready)

    def test_expired_access_without_refresh_is_not_reported_ready(self):
        with patch.dict("os.environ", {
                "FREESOUND_API_TOKEN": "search",
                "FREESOUND_CLIENT_ID": "client",
                "FREESOUND_OAUTH_ACCESS_TOKEN": "expired",
                "FREESOUND_OAUTH_EXPIRES_AT": "900",
                }, clear=True):
            status = freesound_status(now=1000)
        self.assertFalse(status["keep_configured"])
        self.assertIn("Reconnect", status["keep_reason"])

    def test_authorization_code_exchange_returns_renewable_tokens(self):
        opener = Mock(return_value=Response({
            "access_token": "access", "refresh_token": "refresh",
            "expires_in": 86400,
        }))
        tokens = FreesoundCatalog(
            opener=opener, clock=lambda: 1000).exchange_authorization_code(
                client_id="client", client_secret="secret",
                authorization_code="one-time-code")
        request = opener.call_args.args[0]
        self.assertEqual(request.method, "POST")
        self.assertEqual(urllib.parse.parse_qs(request.data.decode()), {
            "client_id": ["client"], "client_secret": ["secret"],
            "grant_type": ["authorization_code"],
            "code": ["one-time-code"],
        })
        self.assertEqual(tokens, FreesoundOAuthTokens(
            "access", "refresh", 87400))

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

    def test_search_preserves_provider_taxonomy_and_all_source_tags(self):
        record = raw_sound()
        record.update({
            "category": "Sounds of things",
            "subcategory": "Doors",
            "category_is_user_provided": False,
            "tags": [f"tag-{index}" for index in range(15)],
        })
        opener = Mock(return_value=Response({"results": [record]}))
        with patch.dict("os.environ", {"FREESOUND_API_TOKEN": "search-token"}):
            sound = FreesoundCatalog(opener=opener).search("wooden door")[0]
        self.assertEqual(len(sound.tags), 15)
        self.assertEqual(
            (sound.provider_category, sound.provider_subcategory,
             sound.provider_category_is_user_provided),
            ("Sounds of things", "Doors", False),
        )
        request_query = urllib.parse.parse_qs(
            urllib.parse.urlparse(opener.call_args.args[0].full_url).query)
        self.assertIn("category_is_user_provided", request_query["fields"][0])

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
                "os.environ", {
                    "FREESOUND_OAUTH_ACCESS_TOKEN": "oauth",
                    "FREESOUND_OAUTH_EXPIRES_AT": "4102444800",
                }):
            target = Path(directory) / "source.download"
            downloaded = FreesoundCatalog(opener=opener).download(
                sound, target)
        request = opener.call_args.args[0]
        self.assertEqual(request.headers["Authorization"], "Bearer oauth")
        self.assertIn("/sounds/931/download/", request.full_url)
        self.assertEqual(downloaded.original_name, sound.name)

    def test_expired_download_access_refreshes_once_and_persists_tokens(self):
        saved = []
        opener = Mock(side_effect=[
            Response({"access_token": "fresh-access",
                      "refresh_token": "fresh-refresh",
                      "expires_in": 86400}),
            Response(b"RIFF-original", {"Content-Length": "13"}),
        ])
        environment = {
            "FREESOUND_API_TOKEN": "secret",
            "FREESOUND_CLIENT_ID": "client",
            "FREESOUND_OAUTH_ACCESS_TOKEN": "expired-access",
            "FREESOUND_OAUTH_REFRESH_TOKEN": "old-refresh",
            "FREESOUND_OAUTH_EXPIRES_AT": "900",
        }
        with TemporaryDirectory() as directory, patch.dict(
                "os.environ", environment, clear=True):
            target = Path(directory) / "source.download"
            downloaded = FreesoundCatalog(
                opener=opener, clock=lambda: 1000,
                save_oauth_tokens=saved.append).download(
                    FakeCatalog.sound_record, target)
        refresh_request = opener.call_args_list[0].args[0]
        download_request = opener.call_args_list[1].args[0]
        self.assertEqual(
            urllib.parse.parse_qs(refresh_request.data.decode())["grant_type"],
            ["refresh_token"])
        self.assertEqual(download_request.headers["Authorization"],
                         "Bearer fresh-access")
        self.assertEqual(saved, [FreesoundOAuthTokens(
            "fresh-access", "fresh-refresh", 87400)])
        self.assertEqual(downloaded.size_bytes, 13)


class FakeWorkspace:
    def __init__(self):
        self.stored = []
        self.discarded = []

    def store_file(self, source, *, original_name, size_bytes):
        self.stored.append((Path(source), original_name, size_bytes))
        return StoredFileVersion(
            filename="kept.wav", path="/media/kept.wav",
            mime_type="audio/wav", family="audio", duration_ms=2400,
            audio_format="wav", media_format="wav", sample_rate=48000,
            channels=2, metadata={"codec": "pcm_s16le", "container": "wav"})

    def discard_media(self, filename):
        self.discarded.append(filename)


class FakeRecords:
    def __init__(self):
        self.created = []
        self.existing = None
        self.competing_existing = None
        self.fail_create = False

    def workspace(self, workspace_id):
        return {"id": workspace_id} if workspace_id == 4 else None

    def catalog_file(self, *, workspace_id, origin, external_id):
        return self.existing

    def create_workspace_file(self, workspace_id, **values):
        if self.fail_create:
            raise RuntimeError("database unavailable")
        self.created.append({"workspace_id": workspace_id, **values})
        stored = values["stored"]
        return {
            "id": 7, "version_id": 8, "name": values["name"],
            "filename": stored.filename, "duration_ms": stored.duration_ms,
            "category": values["category"],
            "tags": list(values["tags"]), "metadata": values["metadata"],
            "audio_format": stored.audio_format,
            "sample_rate": stored.sample_rate, "channels": stored.channels,
            "size_bytes": values["size_bytes"],
            "mime_type": stored.mime_type,
            "version_metadata": stored.metadata,
        }

    def create_workspace_catalog_file(
            self, workspace_id, *, origin, external_id, **values):
        if self.fail_create:
            raise RuntimeError("database unavailable")
        if self.competing_existing:
            return self.competing_existing, True
        return self.create_workspace_file(workspace_id, **values), False


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

    def test_preview_search_never_creates_a_file(self):
        with TemporaryDirectory() as directory:
            service, _, workspace, records = self.service(Path(directory))
            results = service.search("wooden door closing")
        self.assertEqual(results[0]["preview_url"],
                         "https://cdn.freesound.org/preview.mp3")
        self.assertFalse(workspace.stored)
        self.assertFalse(records.created)

    def test_keep_reuses_ingestion_and_persists_provenance_and_category(self):
        with TemporaryDirectory() as directory:
            service, catalog, workspace, records = self.service(Path(directory))
            result = service.keep(
                workspace_id=4, external_id="931",
                name="Heavy wooden door", category="ambience",
                tags=("door", "interior"), folder_id=12)

        self.assertFalse(result["duplicate"])
        self.assertEqual(catalog.downloads, 1)
        self.assertEqual(len(workspace.stored), 1)
        created = records.created[0]
        self.assertEqual(created["category"], "ambience")
        self.assertEqual(created["tags"], ("door", "interior"))
        self.assertEqual(created["folder_id"], 12)
        self.assertEqual(created["metadata"]["origin"], "freesound")
        self.assertEqual(created["metadata"]["external_id"], "931")
        self.assertEqual(created["metadata"]["license"], "cc-by-nc")
        self.assertTrue(created["metadata"]["attribution_required"])
        self.assertEqual(result["file"]["version_id"], 8)

    def test_keep_without_classification_keeps_source_tags_as_provenance_only(self):
        with TemporaryDirectory() as directory:
            service, _, _, records = self.service(Path(directory))
            service.keep(
                workspace_id=4, external_id="931", name="Wooden door",
                category=None, tags=())
        created = records.created[0]
        self.assertIsNone(created["category"])
        self.assertEqual(created["tags"], ())
        self.assertEqual(created["metadata"]["source_tags"],
                         ["door", "wood", "close"])

    def test_duplicate_keep_returns_the_existing_file_without_download(self):
        with TemporaryDirectory() as directory:
            service, catalog, workspace, records = self.service(Path(directory))
            records.existing = {"id": 17, "version_id": 22}
            result = service.keep(
                workspace_id=4, external_id="931", name="Door",
                category="sfx", tags=())
        self.assertTrue(result["duplicate"])
        self.assertEqual(result["file"]["id"], 17)
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
                workspace_id=4, external_id="931", name="Door",
                category="sfx", tags=())
        self.assertTrue(result["duplicate"])
        self.assertEqual(result["file"]["id"], 17)
        self.assertEqual(catalog.downloads, 1)
        self.assertFalse(records.created)
        self.assertEqual(workspace.discarded, ["kept.wav"])

    def test_download_failure_leaves_no_file_or_scratch_file(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            service, _, workspace, records = self.service(
                root, fail_download=True)
            with self.assertRaisesRegex(AudioCatalogError, "download failed"):
                service.keep(
                    workspace_id=4, external_id="931", name="Door",
                    category="sfx", tags=())
            remaining = list((root / "incoming").rglob("*"))
        self.assertFalse(workspace.stored)
        self.assertFalse(records.created)
        self.assertFalse(remaining)

    def test_file_write_failure_discards_the_stored_original(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            service, _, workspace, records = self.service(root)
            records.fail_create = True
            with self.assertRaisesRegex(RuntimeError, "database unavailable"):
                service.keep(
                    workspace_id=4, external_id="931", name="Door",
                    category=None, tags=())
            remaining = list((root / "incoming").rglob("*"))
        self.assertEqual(workspace.discarded, ["kept.wav"])
        self.assertFalse(records.created)
        self.assertFalse(remaining)


if __name__ == "__main__":
    unittest.main()
