"""Locked Origins architecture guardrails without provider or database writes."""

import ast
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from origins.http.app import app
from origins.infrastructure.media_workspace import contained_file


ROOT = Path(__file__).resolve().parents[1]


class OriginsArchitectureTests(unittest.TestCase):
    def test_workspace_is_the_only_business_root(self):
        paths = app.openapi()["paths"]
        expected = {
            "/api/v1/workspaces",
            "/api/v1/workspaces/{workspace_id}",
            "/api/v1/workspaces/{workspace_id}/folders",
            "/api/v1/workspaces/{workspace_id}/projects/audiovisual",
            "/api/v1/workspaces/{workspace_id}/files/upload",
            "/api/v1/projects/{project_identifier}",
            "/api/v1/projects/{project_id}/editor",
            "/api/v1/projects/{project_id}/files",
            "/api/v1/projects/{project_id}/library-files",
            "/api/v1/projects/{project_id}/files/upload",
            "/api/v1/creator/capabilities",
            "/api/v1/creator/models",
            "/api/v1/creator/input-compatibility",
            "/api/v1/creator/generations",
        }
        self.assertTrue(expected.issubset(paths), expected - set(paths))

    def test_legacy_domain_roots_are_not_published(self):
        paths = app.openapi()["paths"]
        forbidden = ("/spaces", "/ventures", "/series", "/productions",
                     "/director", "/file-collections", "/audiovisual-projects")
        self.assertFalse([
            path for path in paths if any(token in path for token in forbidden)
        ])

    def test_canonical_persistence_boundaries_exist(self):
        expected = (
            "origins/infrastructure/postgres/workspaces.py",
            "origins/infrastructure/postgres/projects.py",
            "origins/infrastructure/postgres/files.py",
            "origins/infrastructure/postgres/project_document.py",
        )
        for relative in expected:
            path = ROOT / relative
            self.assertTrue(path.exists(), relative)
            self.assertNotIn("import db", path.read_text(), relative)

    def test_deleted_persistence_boundaries_cannot_return(self):
        obsolete = (
            "origins/infrastructure/postgres/venture_assets.py",
            "origins/infrastructure/postgres/work.py",
            "origins/infrastructure/postgres/project_records.py",
            "origins/infrastructure/postgres/production_document.py",
        )
        for relative in obsolete:
            self.assertFalse((ROOT / relative).exists(), relative)

    def test_creator_context_uses_canonical_ownership(self):
        schemas = app.openapi()["components"]["schemas"]
        context = schemas["CreatorContext"]["properties"]
        self.assertIn("workspace_id", context)
        self.assertIn("project_id", context)
        self.assertIn("project_type", context)
        self.assertIn("folder_id", context)
        self.assertIn("object_id", context)
        self.assertNotIn("space_id", context)
        self.assertNotIn("production_id", context)

    def test_files_are_workspace_owned_and_versioned(self):
        migration = (ROOT / "origins/migrations/000_origins_schema.sql").read_text()
        self.assertIn("CREATE TABLE public.files", migration)
        self.assertIn("workspace_id bigint NOT NULL", migration)
        self.assertIn("CREATE TABLE public.file_versions", migration)
        self.assertIn("CREATE TABLE public.project_file_usages", migration)
        self.assertIn("CREATE TABLE public.object_file_usages", migration)
        self.assertNotIn("source_generation_id", migration)
        self.assertNotIn("legacy_generation_id", migration)

    def test_schema_is_one_clean_origins_baseline(self):
        migrations = sorted((ROOT / "origins/migrations").glob("*.sql"))
        self.assertEqual(
            [path.name for path in migrations],
            ["000_origins_schema.sql"],
        )
        schema = migrations[0].read_text()
        forbidden = (
            "CREATE TABLE public.spaces",
            "CREATE TABLE public.ventures",
            "CREATE TABLE public.series",
            "CREATE TABLE public.productions",
            "CREATE TABLE public.assets",
            "CREATE TABLE public.generations",
        )
        self.assertFalse([token for token in forbidden if token in schema])

    def test_daw_libraries_stay_behind_sound_scene_boundaries(self):
        frontend = ROOT / "frontend/src"
        imports = {
            path.relative_to(frontend).as_posix(): path.read_text()
            for path in frontend.rglob("*.ts*") if ".test." not in path.name
        }
        self.assertEqual(
            [name for name, source in imports.items()
             if "@dawcore/transport" in source],
            ["features/sound-scene/engine/sound-scene-playout.ts"],
        )
        self.assertEqual(
            [name for name, source in imports.items()
             if "@waveform-playlist/core" in source
             or "@waveform-playlist/engine" in source],
            ["features/sound-scene/engine/sound-scene-engine.ts"],
        )

    def test_media_resolver_blocks_traversal_and_directories(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "ok.mp3").write_bytes(b"audio")
            self.assertEqual(
                contained_file(root, "ok.mp3"), (root / "ok.mp3").resolve())
            self.assertIsNone(contained_file(root, "../secret"))
            self.assertIsNone(contained_file(root, "."))

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
