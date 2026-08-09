"""HTTP regressions against the real FastAPI application. No provider calls."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from audio_studio.application.timeline import TimelineError
from audio_studio.application.media import MediaService
from audio_studio.domain.media import MediaFile
from audio_studio.http.app import app
from audio_studio.http.routers import media as media_router
from audio_studio.http.routers import batches as batches_router
from audio_studio.http.routers import timeline as timeline_router
from audio_studio.http.routers import work as work_router
from audio_studio.domain.work import DomainConflict
from audio_studio.infrastructure.media_workspace import LocalMediaWorkspace


class NativeHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()

    def test_react_and_legacy_urls_have_one_canonical_home(self):
        root = self.client.get("/", follow_redirects=False)
        old = self.client.get("/studio/voices", follow_redirects=False)
        self.assertEqual((root.status_code, root.headers["location"]),
                         (307, "/audio-studio/"))
        self.assertEqual((old.status_code, old.headers["location"]),
                         (308, "/audio-studio/voices"))

    def test_removed_paid_routes_are_not_reachable(self):
        for route in ("/api/speak", "/api/part/regenerate",
                      "/api/part/render", "/api/batch/run",
                      "/api/transcribe", "/api/translate/subtitles",
                      "/api/text/shape", "/api/text/tag"):
            with self.subTest(route=route):
                self.assertEqual(self.client.post(route, json={}).status_code, 404)

    def test_configuration_contract_is_live(self):
        response = self.client.get("/api/v1/config")
        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertIn("audio", payload["capabilities"])
        self.assertIn("omni", payload["capabilities"])
        self.assertIn(payload["workspace"]["region"], {"intl", "beijing"})

    def test_voice_catalogue_contracts_are_live(self):
        registry = self.client.get("/api/v1/voice-registry")
        metadata = self.client.get("/api/v1/voice-meta")
        usage = self.client.get("/api/v1/voice-usage")
        route = self.client.post("/api/v1/voice-routes/resolve", json={
            "voice": "Tina", "engine": "omni", "model": "plus",
            "language": "Arabic", "text": "مرحبا",
        })

        for response in (registry, metadata, usage, route):
            self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(registry.json()["data"]["bindings"])
        self.assertIsInstance(metadata.json()["data"], dict)
        self.assertIsInstance(usage.json()["data"], dict)
        resolved = route.json()["data"]
        self.assertEqual(resolved["engine"], "omni")
        self.assertTrue(resolved["provider_voice_id"])

    def test_voice_identity_contracts_are_live_without_provider_calls(self):
        profiles = self.client.get("/api/v1/voices?limit=100")
        history = self.client.get("/api/v1/voice-history/unlinked?limit=100")
        plan = self.client.post("/api/v1/voice-packages/preflight", json={
            "language": "English", "package": "complete",
        })

        for response in (profiles, history, plan):
            self.assertEqual(response.status_code, 200, response.text)
        identities = profiles.json()["data"]
        self.assertEqual(profiles.json()["meta"]["count"], len(identities))
        if identities:
            detail = self.client.get(f"/api/v1/voices/{identities[0]['id']}")
            self.assertEqual(detail.status_code, 200, detail.text)
            self.assertEqual(detail.json()["data"]["id"], identities[0]["id"])
        self.assertIsInstance(history.json()["data"], list)
        package = plan.json()["data"]
        self.assertEqual(package["region"], "intl")
        self.assertEqual(len(package["available_routes"]), 3)

    def test_media_is_typed_seekable_and_security_hardened(self):
        with TemporaryDirectory() as directory:
            target = Path(directory) / "brand.png"
            target.write_bytes(b"0123456789")
            with patch.object(
                    media_router.media_service, "resolve",
                    return_value=MediaFile(target)):
                response = self.client.get(
                    "/icon/brand.png", headers={"Range": "bytes=0-3"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, b"0123")
        self.assertEqual(response.headers["content-type"], "image/png")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertEqual(response.headers["x-frame-options"], "DENY")
        self.assertTrue(response.headers["x-request-id"].startswith("req_"))

    def test_export_and_generation_download_use_canonical_identity(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "final.mp3").write_bytes(b"export audio")
            (root / "take.mp3").write_bytes(b"generation audio")
            records = Mock()
            records.export.return_value = {
                "id": 91, "filename": "final.mp3"}
            records.generation.return_value = {
                "id": 150, "filename": "take.mp3"}
            service = MediaService(
                LocalMediaWorkspace(
                    root=root, output=root, voice_samples=root),
                records,
            )
            with patch.object(media_router, "media_service", service):
                exported = self.client.get("/api/v1/exports/91/download")
                generated = self.client.get("/api/v1/generations/150/download")
        self.assertEqual(exported.content, b"export audio")
        self.assertEqual(generated.content, b"generation audio")
        self.assertIn("final.mp3", exported.headers["content-disposition"])
        self.assertIn("take.mp3", generated.headers["content-disposition"])

    def test_upload_limits_fail_before_body_processing(self):
        response = self.client.post(
            "/api/v1/project-covers/upload", content=b"",
            headers={"Content-Length": "8000001", "X-Filename": "cover.png"})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["error"]["code"], "upload_too_large")

    def test_batch_preview_uses_the_composed_intake_service(self):
        preview = {
            "token": "fixture-token", "name": "rows.csv",
            "headers": ["text"], "rows": 1, "preview": [["Hello"]],
            "guess": {"text": 0}, "voices": {"unknown": [], "checked": 0},
            "truncated": False, "max_rows": 500,
        }
        with patch.object(
                batches_router.batch_intake_service, "preview",
                return_value=preview) as called:
            response = self.client.post(
                "/api/v1/batches/preview", content=b"text\nHello\n",
                headers={"X-Filename": "rows.csv"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["data"], preview)
        called.assert_called_once_with(b"text\nHello\n", "rows.csv")

    def test_validation_uses_the_public_error_envelope(self):
        response = self.client.post("/api/v1/projects/3/series", json={})
        payload = response.json()
        self.assertEqual(response.status_code, 422)
        self.assertEqual(payload["error"]["code"], "validation_error")
        self.assertTrue(payload["error"]["details"]["fields"])
        self.assertEqual(payload["error"]["request_id"],
                         response.headers["x-request-id"])

    def test_work_routes_keep_series_and_production_semantics(self):
        series = {
            "id": 44, "public_id": "fixture-series", "type": "series",
            "key": "series:44", "parent_key": "project:3",
            "name": "Fixture Series", "description": "", "icon": "",
            "defaults": {}, "metrics": {
                "production_count": 0, "part_count": 0, "duration_ms": 0,
                "total_cost": 0, "current_sequence_cost": 0,
            },
        }
        overview = {
            "resource": {
                "id": 3, "public_id": "fixture-project", "type": "project",
                "key": "project:3", "name": "Project", "description": "",
                "icon": "",
            },
            "trail": [],
            "series": [series],
            "standalone_productions": [{
                "id": 7, "public_id": "fixture-production",
                "type": "production", "key": "production:7",
                "name": "Standalone", "description": "", "status": "draft",
                "series_id": None, "part_count": 0, "duration_ms": 0,
                "total_cost": 0, "current_sequence_cost": 0,
            }],
            "metrics": {
                "series_count": 1, "standalone_count": 1,
                "production_count": 1, "part_count": 0, "duration_ms": 0,
                "total_cost": 0, "current_sequence_cost": 0,
            },
        }
        with patch.object(
                work_router.work_service, "create", return_value=series), \
             patch.object(
                 work_router.work_service, "overview", return_value=overview):
            created = self.client.post(
                "/api/v1/projects/3/series", json={"name": "Fixture Series"})
            opened = self.client.get("/api/v1/projects/3/overview")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["data"]["parent_key"], "project:3")
        self.assertEqual(opened.json()["data"]["series"][0]["type"], "series")
        self.assertIsNone(
            opened.json()["data"]["standalone_productions"][0]["series_id"])

        with patch.object(
                work_router.work_service, "update",
                side_effect=DomainConflict(
                    "A Production can only join a Series in its own Project.")):
            conflict = self.client.patch(
                "/api/v1/productions/7", json={"series_id": 99})
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["error"]["code"], "domain_conflict")

    def test_timeline_contract_preserves_music_and_silence_rules(self):
        with patch.object(
                timeline_router.timeline_service, "add_silence",
                return_value={"id": 101, "seconds": 2.5}):
            silence = self.client.post(
                "/api/v1/productions/7/parts/silence",
                json={"seconds": 2.5, "insert_at": None})
        self.assertEqual(silence.status_code, 200)
        self.assertEqual(silence.json()["data"], {"id": 101, "seconds": 2.5})

        with patch.object(
                timeline_router.timeline_service, "insert_asset",
                side_effect=TimelineError(
                    "Music is a background bed. Choose it in the Music controls.")):
            music = self.client.post(
                "/api/v1/productions/7/parts/assets", json={"asset_id": 55})
        self.assertEqual(music.status_code, 400)
        self.assertEqual(music.json()["error"]["code"], "timeline_error")

        with patch.object(
                timeline_router.timeline_service, "set_music",
                return_value={"music_of": None}) as remove:
            response = self.client.patch(
                "/api/v1/productions/6/music", json={"music_of": None})
        self.assertEqual(response.status_code, 200)
        remove.assert_called_once_with(6, {"music_of": None})


if __name__ == "__main__":
    unittest.main()
