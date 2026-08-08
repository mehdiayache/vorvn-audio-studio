"""Architecture guardrails. No provider calls and no database writes."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from audio_studio.application.media import _contained_file
from audio_studio.http.app import COMPATIBILITY_ALLOWLIST, app
from audio_studio.http.routers.jobs import SpeechJobCreate, TranscriptionJobCreate


ROOT = Path(__file__).parent


class AudioStudioArchitectureTests(unittest.TestCase):
    def test_public_contract_contains_native_product_slices(self):
        paths = app.openapi()["paths"]
        expected = {
            "/api/v1/config",
            "/api/v1/hierarchy",
            "/api/v1/productions/{production_id}/music",
            "/api/v1/productions/{production_id}/parts/silence",
            "/api/v1/jobs/speech",
            "/api/v1/jobs/transcription",
            "/api/v1/jobs/translation",
            "/api/v1/jobs/text",
            "/api/v1/jobs/render",
            "/api/v1/batches/preview",
            "/api/v1/subtitles/uploads",
            "/api/v1/subtitles/{transcript_id}/layouts/{profile}",
            "/api/v1/asset-collections/{collection_id}/assets/upload",
            "/api/v1/voice-packages",
            "/api/v1/settings/provider",
            "/api/v1/settings/storage",
            "/api/v1/settings/pronunciations",
            "/api/v1/settings/maintenance",
        }
        self.assertTrue(expected.issubset(paths), expected - set(paths))

    def test_every_speech_operation_has_the_required_target(self):
        SpeechJobCreate(text="Hello", voice="Tina", engine="omni", model="plus")
        with self.assertRaises(ValueError):
            SpeechJobCreate(text="Hello", voice="Tina", engine="omni",
                            model="plus", operation="regenerate")

    def test_transcription_accepts_library_or_uploaded_audio_only(self):
        TranscriptionJobCreate(file="take.mp3", generation_id=7)
        TranscriptionJobCreate(url="https://storage.example/audio", name="take.mp3")
        with self.assertRaises(ValueError):
            TranscriptionJobCreate()

    def test_media_resolver_blocks_traversal_and_directories(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "ok.mp3").write_bytes(b"audio")
            self.assertEqual(_contained_file(root, "ok.mp3"), (root / "ok.mp3").resolve())
            self.assertIsNone(_contained_file(root, "../secret"))
            self.assertIsNone(_contained_file(root, "."))

    def test_react_never_calls_paid_legacy_routes_directly(self):
        client = (ROOT / "frontend/src/lib/api.ts").read_text()
        forbidden = ('post<GenerateResult>("/api/part/render"',
                     'post<GenerateResult>("/api/part/regenerate"',
                     'post<CaptionMutationResult>("/api/transcribe"',
                     'post<CaptionMutationResult>("/api/translate/subtitles"',
                     'post<TextPassResult>(`/api/text/',
                     'post<BatchResult>("/api/batch/run"')
        self.assertFalse([route for route in forbidden if route in client])

    def test_compatibility_boundary_is_explicit_and_has_no_escape_hatch(self):
        self.assertEqual(COMPATIBILITY_ALLOWLIST, set())
        self.assertFalse(any(getattr(route, "path", "").startswith("/legacy")
                             for route in app.routes))
        self.assertFalse(any(getattr(route, "path", "").startswith(("/download", "/stream"))
                             for route in app.routes))
        self.assertFalse(any(getattr(route, "path", "") == "/api/{path:path}"
                             for route in app.routes))

    def test_legacy_http_and_ui_implementations_are_gone(self):
        runtime = (ROOT / "audio_studio/runtime.py").read_text()
        self.assertNotIn("server.py", runtime)
        self.assertNotIn("legacy_port", runtime)
        for obsolete in ("server.py", "ui", "check_app.py", "check_voices.py",
                         "build_voices.py"):
            self.assertFalse((ROOT / obsolete).exists(), obsolete)

    def test_voice_surfaces_use_the_native_postgres_repository(self):
        for relative in (
                "audio_studio/application/voices.py",
                "audio_studio/application/catalog.py",
                "audio_studio/http/routers/catalog.py"):
            source = (ROOT / relative).read_text()
            self.assertNotIn("db.voice_", source, relative)
        legacy = (ROOT / "db.py").read_text()
        self.assertNotIn("def voice_", legacy)
        repository = ROOT / "audio_studio/infrastructure/postgres/voices.py"
        self.assertTrue(repository.exists())


if __name__ == "__main__":
    unittest.main()
