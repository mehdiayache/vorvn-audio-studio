"""HTTP regressions against the real FastAPI application. No provider calls."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from audio_studio.application import media, timeline
from audio_studio.http.app import app
from audio_studio.http.routers import work as work_router
from audio_studio.domain.work import DomainConflict


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

    def test_media_is_typed_seekable_and_security_hardened(self):
        with TemporaryDirectory() as directory:
            target = Path(directory) / "brand.png"
            target.write_bytes(b"0123456789")
            with patch.object(media, "resolve", return_value=media.MediaFile(target)):
                response = self.client.get(
                    "/icon/brand.png", headers={"Range": "bytes=0-3"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, b"0123")
        self.assertEqual(response.headers["content-type"], "image/png")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertEqual(response.headers["x-frame-options"], "DENY")
        self.assertTrue(response.headers["x-request-id"].startswith("req_"))

    def test_upload_limits_fail_before_body_processing(self):
        response = self.client.post(
            "/api/v1/project-covers/upload", content=b"",
            headers={"Content-Length": "8000001", "X-Filename": "cover.png"})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["error"]["code"], "upload_too_large")

    def test_validation_uses_the_public_error_envelope(self):
        response = self.client.post("/api/v1/projects/3/series", json={})
        payload = response.json()
        self.assertEqual(response.status_code, 422)
        self.assertEqual(payload["error"]["code"], "validation_error")
        self.assertTrue(payload["error"]["details"]["fields"])
        self.assertEqual(payload["error"]["request_id"],
                         response.headers["x-request-id"])

    def test_work_routes_keep_series_and_production_semantics(self):
        series = {"id": 44, "type": "series", "parent_key": "project:3",
                  "name": "Fixture Series"}
        overview = {
            "resource": {"id": 3, "type": "project", "name": "Project"},
            "series": [series],
            "standalone_productions": [
                {"id": 7, "type": "production", "series_id": None}],
        }
        with patch.object(work_router.work, "create", return_value=series), \
             patch.object(work_router.work, "overview", return_value=overview):
            created = self.client.post(
                "/api/v1/projects/3/series", json={"name": "Fixture Series"})
            opened = self.client.get("/api/v1/projects/3/overview")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["data"]["parent_key"], "project:3")
        self.assertEqual(opened.json()["data"]["series"][0]["type"], "series")
        self.assertIsNone(
            opened.json()["data"]["standalone_productions"][0]["series_id"])

        with patch.object(
                work_router.work, "update",
                side_effect=DomainConflict(
                    "A Production can only join a Series in its own Project.")):
            conflict = self.client.patch(
                "/api/v1/productions/7", json={"series_id": 99})
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["error"]["code"], "domain_conflict")

    def test_timeline_contract_preserves_music_and_silence_rules(self):
        with patch.object(
                timeline, "add_silence",
                return_value={"id": 101, "seconds": 2.5}):
            silence = self.client.post(
                "/api/v1/productions/7/parts/silence",
                json={"seconds": 2.5, "insert_at": None})
        self.assertEqual(silence.status_code, 200)
        self.assertEqual(silence.json()["data"], {"id": 101, "seconds": 2.5})

        with patch.object(
                timeline, "insert_asset",
                side_effect=timeline.TimelineError(
                    "Music is a background bed. Choose it in the Music controls.")):
            music = self.client.post(
                "/api/v1/productions/7/parts/assets", json={"asset_id": 55})
        self.assertEqual(music.status_code, 400)
        self.assertEqual(music.json()["error"]["code"], "timeline_error")

        with patch.object(timeline, "set_music", return_value={"music_of": None}) as remove:
            response = self.client.patch(
                "/api/v1/productions/6/music", json={"music_of": None})
        self.assertEqual(response.status_code, 200)
        remove.assert_called_once_with(6, {"music_of": None})


if __name__ == "__main__":
    unittest.main()
