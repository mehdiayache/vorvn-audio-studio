"""Architecture guardrails. No provider calls and no database writes."""

import ast
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from audio_studio.http.app import app
from audio_studio.http.routers.composer_drafts import ProductionContext
from audio_studio.http.routers.jobs import SpeechJobCreate, TranscriptionJobCreate
from audio_studio.infrastructure.media_workspace import contained_file


ROOT = Path(__file__).resolve().parents[1]


class AudioStudioArchitectureTests(unittest.TestCase):
    def test_daw_libraries_are_kept_behind_the_two_sound_scene_boundaries(self):
        frontend = ROOT / "frontend" / "src"
        imports = {
            path.relative_to(frontend).as_posix(): path.read_text()
            for path in frontend.rglob("*.ts*")
            if ".test." not in path.name
        }
        dawcore = [name for name, source in imports.items()
                   if "@dawcore/transport" in source]
        naomi = [name for name, source in imports.items()
                 if "@waveform-playlist/core" in source
                 or "@waveform-playlist/engine" in source]
        self.assertEqual(dawcore, [
            "features/sound-scene/engine/sound-scene-playout.ts"])
        self.assertEqual(naomi, [
            "features/sound-scene/engine/sound-scene-engine.ts"])

    def test_public_contract_contains_native_product_slices(self):
        paths = app.openapi()["paths"]
        expected = {
            "/api/v1/config",
            "/api/v1/hierarchy",
            "/api/v1/productions/{production_id}/sound-scene",
            "/api/v1/productions/{production_id}/parts/silence",
            "/api/v1/jobs/speech",
            "/api/v1/jobs/transcription",
            "/api/v1/jobs/translation",
            "/api/v1/jobs/text",
            "/api/v1/jobs/render",
            "/api/v1/subtitles/uploads",
            "/api/v1/subtitles/{transcript_id}/layouts/{profile}",
            "/api/v1/asset-collections/{collection_id}/assets/upload",
            "/api/v1/voice-packages",
            "/api/v1/settings/provider",
            "/api/v1/settings/providers/alibaba/test",
            "/api/v1/settings/storage",
            "/api/v1/settings/pronunciations",
            "/api/v1/settings/maintenance",
        }
        self.assertTrue(expected.issubset(paths), expected - set(paths))

    def test_operational_endpoints_publish_generated_response_contracts(self):
        paths = app.openapi()["paths"]
        for route in ("/api/v1/activity", "/api/v1/system/health"):
            schema = paths[route]["get"]["responses"]["200"]["content"][
                "application/json"]["schema"]
            self.assertIn("$ref", schema, route)

    def test_catalogue_endpoints_publish_generated_response_contracts(self):
        paths = app.openapi()["paths"]
        routes = (
            ("/api/v1/config", "get"),
            ("/api/v1/voice-registry", "get"),
            ("/api/v1/voice-usage", "get"),
            ("/api/v1/voice-meta", "get"),
            ("/api/v1/voice-routes/resolve", "post"),
        )
        for route, method in routes:
            schema = paths[route][method]["responses"]["200"]["content"][
                "application/json"]["schema"]
            self.assertIn("$ref", schema, route)

    def test_voice_registry_contract_is_open_to_new_provider_models(self):
        schemas = app.openapi()["components"]["schemas"]
        binding = schemas["VoiceBindingResponse"]["properties"]
        summary = schemas["VoiceModelSummaryResponse"]["properties"]
        self.assertNotIn("enum", binding["engine"])
        self.assertNotIn("enum", binding["tier"])
        self.assertNotIn("enum", summary["engine"])
        self.assertNotIn("enum", summary["tier"])

    def test_job_endpoints_publish_generated_response_contracts(self):
        paths = app.openapi()["paths"]
        routes = (
            ("/api/v1/jobs/speech", "post", "202"),
            ("/api/v1/jobs/render", "post", "202"),
            ("/api/v1/jobs/transcription", "post", "202"),
            ("/api/v1/jobs/translation", "post", "202"),
            ("/api/v1/jobs/text", "post", "202"),
            ("/api/v1/jobs/{job_id}", "get", "200"),
            ("/api/v1/jobs/{job_id}/events", "get", "200"),
            ("/api/v1/jobs/{job_id}/cancel", "post", "200"),
        )
        for route, method, status in routes:
            schema = paths[route][method]["responses"][status]["content"][
                "application/json"]["schema"]
            self.assertIn("$ref", schema, route)

    def test_voice_endpoints_publish_generated_response_contracts(self):
        paths = app.openapi()["paths"]
        routes = (
            ("/api/v1/voices", "get", "200"),
            ("/api/v1/voices/{identity_id}", "get", "200"),
            ("/api/v1/voices/{identity_id}", "patch", "200"),
            ("/api/v1/voices/{identity_id}", "delete", "200"),
            ("/api/v1/voice-history/unlinked", "get", "200"),
            ("/api/v1/voices/{identity_id}/link-history", "post", "200"),
            ("/api/v1/voice-packages/preflight", "post", "200"),
            ("/api/v1/voice-packages", "post", "202"),
            ("/api/v1/voice-packages/retry", "post", "202"),
        )
        for route, method, status in routes:
            schema = paths[route][method]["responses"][status]["content"][
                "application/json"]["schema"]
            self.assertIn("$ref", schema, route)

    def test_upload_endpoints_publish_generated_response_contracts(self):
        paths = app.openapi()["paths"]
        routes = (
            ("/api/v1/project-covers/upload", "200"),
            ("/api/v1/venture-logos/upload", "200"),
            ("/api/v1/voice-images/upload", "200"),
            ("/api/v1/voice-references/upload", "200"),
            ("/api/v1/asset-collections/{collection_id}/assets/upload", "201"),
            ("/api/v1/subtitles/uploads", "200"),
        )
        for route, status in routes:
            schema = paths[route]["post"]["responses"][status]["content"][
                "application/json"]["schema"]
            self.assertIn("$ref", schema, route)

    def test_speech_part_recording_requires_its_production(self):
        SpeechJobCreate(text="Hello", catalogue_voice_id="catalogue:tina")
        with self.assertRaises(ValueError):
            SpeechJobCreate(text="Hello", catalogue_voice_id="catalogue:tina",
                            part_id=8)

    def test_removed_batch_and_take_contracts_cannot_reappear(self):
        paths = app.openapi()["paths"]
        self.assertFalse(any("batch" in path or "take" in path
                             for path in paths))
        self.assertNotIn("operation", SpeechJobCreate.model_fields)
        self.assertNotIn("insert_at", SpeechJobCreate.model_fields)
        self.assertNotIn("operation", ProductionContext.model_fields)
        self.assertEqual(set(paths["/api/v1/ventures"]), {"post"})
        for path in (
            "/api/v1/ventures/{resource_id}",
            "/api/v1/projects/{resource_id}",
            "/api/v1/series/{resource_id}",
            "/api/v1/productions/{resource_id}",
        ):
            self.assertNotIn("get", paths[path])

    def test_transcription_accepts_library_or_uploaded_audio_only(self):
        TranscriptionJobCreate(file="clip.mp3", part_id=7)
        TranscriptionJobCreate(url="https://storage.example/audio", name="clip.mp3")
        with self.assertRaises(ValueError):
            TranscriptionJobCreate()

    def test_media_resolver_blocks_traversal_and_directories(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "ok.mp3").write_bytes(b"audio")
            self.assertEqual(contained_file(root, "ok.mp3"), (root / "ok.mp3").resolve())
            self.assertIsNone(contained_file(root, "../secret"))
            self.assertIsNone(contained_file(root, "."))

    def test_public_media_lookup_uses_native_persistence(self):
        for relative in (
                "audio_studio/application/media.py",
                "audio_studio/infrastructure/postgres/media.py"):
            source = (ROOT / relative).read_text()
            self.assertNotIn("import db", source, relative)
            self.assertNotIn("db.", source, relative)

    def test_react_never_calls_paid_legacy_routes_directly(self):
        client = (ROOT / "frontend/src/lib/api.ts").read_text()
        forbidden = ('post<GenerateResult>("/api/part/render"',
                     'post<GenerateResult>("/api/part/regenerate"',
                     'post<CaptionMutationResult>("/api/transcribe"',
                     'post<CaptionMutationResult>("/api/translate/subtitles"',
                     'post<TextPassResult>(`/api/text/')
        self.assertFalse([route for route in forbidden if route in client])

    def test_compatibility_boundary_is_explicit_and_has_no_escape_hatch(self):
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
        repository = ROOT / "audio_studio/infrastructure/postgres/voices.py"
        self.assertTrue(repository.exists())

    def test_clone_discovery_has_one_provider_neutral_catalogue_owner(self):
        planner = (ROOT / "audio_studio/domain/voice_packages.py").read_text()
        service = (ROOT / "audio_studio/application/voices.py").read_text()
        composition = (ROOT / "audio_studio/composition/voices.py").read_text()
        self.assertNotIn("provider_catalog", planner)
        self.assertNotIn('"provider": "alibaba"', planner)
        self.assertNotIn("alibaba_environment", service)
        self.assertIn("self.method_store.enrollment_methods()", service)
        self.assertIn("ProviderCatalogueRepository", composition)

    def test_control_plane_has_no_legacy_persistence_calls(self):
        for relative in (
                "audio_studio/application/activity.py",
                "audio_studio/application/catalog.py",
                "audio_studio/application/settings.py",
                "audio_studio/application/system.py",
                "audio_studio/http/routers/activity.py",
                "audio_studio/http/routers/settings.py",
                "audio_studio/http/routers/system.py",
        ):
            source = (ROOT / relative).read_text()
            self.assertNotIn("import db", source, relative)
            self.assertNotIn("db.", source, relative)
    def test_venture_asset_library_uses_native_persistence(self):
        repository = ROOT / "audio_studio/infrastructure/postgres/venture_assets.py"
        self.assertTrue(repository.exists())
        forbidden = (
            "db.ensure_assets", "db.venture_assets",
            "db.asset_collections_for_venture", "db.assets_for_venture",
            "db.is_asset_folder", "db.asset_register_generation",
            "db.asset_get", "db.asset_library_context", "db.asset_allowed",
        )
        for relative in (
                "audio_studio/application/work.py",
                "audio_studio/application/uploads.py",
                "audio_studio/application/timeline.py"):
            source = (ROOT / relative).read_text()
            for call in forbidden:
                self.assertNotIn(call, source, f"{relative}: {call}")
    def test_canonical_work_lifecycle_uses_native_persistence(self):
        repository = ROOT / "audio_studio/infrastructure/postgres/work.py"
        accounting = ROOT / "audio_studio/infrastructure/postgres/accounting.py"
        self.assertTrue(repository.exists())
        self.assertTrue(accounting.exists())
        self.assertFalse((ROOT / "domain/repository.py").exists())
        for path in (repository, accounting):
            source = path.read_text()
            self.assertNotIn("import db", source, str(path))
            self.assertNotIn("db.", source, str(path))
        for relative in (
                "audio_studio/application/work.py",
                "audio_studio/application/timeline.py",
                "audio_studio/http/routers/work.py"):
            source = (ROOT / relative).read_text()
            self.assertNotIn("domain.repository", source, relative)
            self.assertNotIn("from domain import repository", source, relative)
    def test_production_document_and_timeline_use_native_persistence(self):
        repository = (
            ROOT / "audio_studio/infrastructure/postgres/production_document.py")
        self.assertTrue(repository.exists())
        source = repository.read_text()
        self.assertNotIn("import db", source)
        self.assertNotIn("db.", source)
        for relative in (
                "audio_studio/application/work.py",
                "audio_studio/application/timeline.py"):
            application = (ROOT / relative).read_text()
            self.assertNotIn("import db", application, relative)
            self.assertNotIn("db.", application, relative)

    def test_render_and_export_use_native_persistence(self):
        repository = ROOT / "audio_studio/infrastructure/postgres/exports.py"
        self.assertTrue(repository.exists())
        for relative in (
                "audio_studio/infrastructure/postgres/exports.py",
                "audio_studio/application/renders.py"):
            source = (ROOT / relative).read_text()
            self.assertNotIn("import db", source, relative)
            self.assertNotIn("db.", source, relative)

    def test_legacy_database_module_is_gone(self):
        self.assertFalse((ROOT / "db.py").exists())
        for path in ROOT.rglob("*.py"):
            if any(part in {".venv", "node_modules"} for part in path.parts):
                continue
            tree = ast.parse(path.read_text())
            imports_legacy = any(
                (isinstance(node, ast.Import)
                 and any(alias.name == "db" for alias in node.names))
                or (isinstance(node, ast.ImportFrom) and node.module == "db")
                for node in ast.walk(tree)
            )
            self.assertFalse(imports_legacy, str(path))


if __name__ == "__main__":
    unittest.main()
