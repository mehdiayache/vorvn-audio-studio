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
from audio_studio.http.routers import timeline as timeline_router
from audio_studio.http.routers import sound_scenes as sound_scene_router
from audio_studio.http.routers import work as work_router
from audio_studio.http.routers import jobs as jobs_router
from audio_studio.domain.work import DomainConflict
from audio_studio.infrastructure.media_workspace import LocalMediaWorkspace


class NativeHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Entering the client is what runs FastAPI's lifespan.  A plain
        # TestClient instance silently skips the real migration/catalogue
        # startup path and made this suite depend on a developer's populated
        # database instead of the clean PostgreSQL used by CI.
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)

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
        self.assertIn("qwen_tts", payload["capabilities"])
        self.assertEqual(
            set(payload["capabilities"]), {"audio", "qwen_tts", "cosyvoice"})
        self.assertIn(payload["workspace"]["region"], {"intl", "beijing"})

    def test_voice_catalogue_contracts_are_live(self):
        registry = self.client.get("/api/v1/voice-registry")
        catalogue = next(item for item in registry.json()["data"]["bindings"]
                         if item["catalogue_voice_id"]
                         and item["engine"] == "audio"
                         and item["tier"] == "plus")
        metadata = self.client.get("/api/v1/voice-meta")
        usage = self.client.get("/api/v1/voice-usage")
        route = self.client.post("/api/v1/voice-routes/resolve", json={
            "catalogue_voice_id": catalogue["catalogue_voice_id"],
            "language": "English", "text": "Hello",
        })

        for response in (registry, metadata, usage, route):
            self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(registry.json()["data"]["bindings"])
        self.assertIsInstance(metadata.json()["data"], dict)
        self.assertIsInstance(usage.json()["data"], dict)
        resolved = route.json()["data"]
        self.assertEqual(resolved["engine"], "audio")
        self.assertEqual(resolved["catalogue_voice_id"],
                         catalogue["catalogue_voice_id"])
        self.assertTrue(resolved["provider_voice_id"])

    def test_speech_route_conflicts_fail_before_a_job_is_created(self):
        with patch.object(
                jobs_router.catalog_service, "resolve_voice",
                side_effect=ValueError(
                    "Qwen Audio TTS cannot produce Arabic with this voice. "
                    "Choose Arabic & multilingual.")), patch.object(
                        jobs_router.job_service, "enqueue") as enqueue:
            response = self.client.post("/api/v1/jobs/speech", json={
                "text": "مرحبا",
                "binding_id": "11111111-1111-4111-8111-111111111111",
                "language": "Arabic",
            })
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(
            response.json()["error"]["code"], "voice_route_unavailable")
        enqueue.assert_not_called()

    def test_speech_engine_and_quality_must_match(self):
        response = self.client.post("/api/v1/jobs/speech", json={
            "text": "Hello", "voice": "custom-voice",
            "engine": "qwen_tts", "model": "flash",
        })
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()["error"]["code"], "validation_error")

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

    def test_audio_route_honors_byte_ranges_and_head_without_loading_the_body(self):
        with TemporaryDirectory() as directory:
            target = Path(directory) / "long-scene.mp3"
            target.write_bytes(b"0123456789abcdef")
            with patch.object(
                    media_router.media_service, "resolve",
                    return_value=MediaFile(target)):
                ranged = self.client.get(
                    "/audio/long-scene.mp3",
                    headers={"Range": "bytes=4-9"},
                )
                head = self.client.head("/audio/long-scene.mp3")

        self.assertEqual(ranged.status_code, 206)
        self.assertEqual(ranged.content, b"456789")
        self.assertEqual(ranged.headers["accept-ranges"], "bytes")
        self.assertEqual(ranged.headers["content-range"], "bytes 4-9/16")
        self.assertEqual(ranged.headers["content-length"], "6")
        self.assertEqual(head.status_code, 200)
        self.assertEqual(head.content, b"")
        self.assertEqual(head.headers["accept-ranges"], "bytes")
        self.assertEqual(head.headers["content-length"], "16")

    def test_export_and_recording_download_use_canonical_identity(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "final.mp3").write_bytes(b"export audio")
            (root / "clip.mp3").write_bytes(b"generation audio")
            records = Mock()
            records.export.return_value = {
                "id": 91, "filename": "final.mp3"}
            records.clip.return_value = {
                "id": 150, "filename": "clip.mp3"}
            service = MediaService(
                LocalMediaWorkspace(
                    root=root, output=root, voice_samples=root),
                records,
            )
            with patch.object(media_router, "media_service", service):
                exported = self.client.get("/api/v1/exports/91/download")
                generated = self.client.get("/api/v1/recordings/150/download")
        self.assertEqual(exported.content, b"export audio")
        self.assertEqual(generated.content, b"generation audio")
        self.assertIn("final.mp3", exported.headers["content-disposition"])
        self.assertIn("clip.mp3", generated.headers["content-disposition"])

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
                json={"seconds": 2.5})
        self.assertEqual(silence.status_code, 200)
        self.assertEqual(silence.json()["data"], {"id": 101, "seconds": 2.5})

        with patch.object(
                timeline_router.timeline_service, "add_draft",
                return_value={"id": 102}) as add_draft:
            draft = self.client.post(
                "/api/v1/productions/7/parts/drafts",
                json={
                    "text": "A deliberate insertion-point Draft.",
                    "authored_role": "Night Guide",
                    "spoken_profile": "spoken_2",
                    "enable_ssml": True,
                    "insert_before_part_id": "part-before",
                })
        self.assertEqual(draft.status_code, 200)
        add_draft.assert_called_once()
        self.assertEqual(
            add_draft.call_args.args[1]["insert_before_part_id"],
            "part-before")
        self.assertEqual(
            add_draft.call_args.args[1]["authored_role"], "Night Guide")
        self.assertEqual(
            (add_draft.call_args.args[1]["spoken_profile"],
             add_draft.call_args.args[1]["enable_ssml"]),
            ("spoken_2", True))

        with patch.object(
                timeline_router.timeline_service, "insert_asset",
                side_effect=TimelineError(
                    "Music is a background bed. Choose it in the Music controls.")):
            music = self.client.post(
                "/api/v1/productions/7/parts/assets", json={"asset_id": 55})
        self.assertEqual(music.status_code, 400)
        self.assertEqual(music.json()["error"]["code"], "timeline_error")

        document = {"version": 1, "sequence_overrides": {}, "tracks": [{
            "id": "music", "kind": "music", "name": "Music",
            "volume": 1, "muted": False, "clips": [],
        }]}
        with patch.object(
                sound_scene_router.sound_scene_service, "update",
                return_value={
                    "production_id": 6, "revision": 2,
                    "document": document, "can_undo": True,
                    "can_redo": False, "updated_at": "2026-08-18T00:00:00",
                    "resolved": {
                        "version": 1, "signature": "scene",
                        "sequence_projection": {
                            "signature": "voice", "duration_ms": 0,
                            "sample_rate": 48000, "spans": [],
                        },
                        "tracks": document["tracks"], "orphans": [],
                    },
                    "sequence_stem": {
                        "url": "", "filename": "", "duration_ms": 0,
                        "signature": "voice", "cached": True,
                    },
                }) as update:
            response = self.client.patch(
                "/api/v1/productions/6/sound-scene",
                json={"expected_revision": 1, "document": document})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["revision"], 2)
        update.assert_called_once_with(6, 1, document)
        self.assertEqual(
            self.client.patch("/api/v1/productions/6/music", json={}).status_code,
            404,
        )


if __name__ == "__main__":
    unittest.main()
