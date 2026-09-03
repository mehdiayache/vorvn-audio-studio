"""Real PostgreSQL lifecycle checks for immutable Production Exports."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

import psycopg

from origins.application.renders import RenderService
from origins.composition.productions import production_service as work
from origins.config import settings
from origins.domain.rendering import FinishedExport
from origins.domain.sound_scene import empty_scene
from origins.infrastructure.postgres.exports import ProductionExportRepository
from origins.infrastructure.postgres.workspaces import WorkspaceRepository


class ProductionExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            raise unittest.SkipTest(str(error)) from error
        connection.close()

    def setUp(self):
        self.marker = uuid4().hex[:12]
        records = WorkspaceRepository()
        self.workspace_record = records.create_workspace(
            f"Export {self.marker}", "Export integration tests")
        self.production = records.create_audiovisual_production(
            int(self.workspace_record["id"]), f"Production {self.marker}", "", None)
        self.repository = ProductionExportRepository()

    def tearDown(self):
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("DELETE FROM workspaces WHERE id=%s",
                               (self.workspace_record["id"],))
            database.commit()

    def test_export_is_atomic_immutable_history_not_a_timeline_part(self):
        production_id = int(self.production["id"])
        manifest = {"version": 1, "parts": [{"part_id": 42}]}
        created = self.repository.create(
            production_id, filename=f"final-{self.marker}.mp3",
            path=f"/tmp/final-{self.marker}.mp3", manifest=manifest,
            renderer="test-renderer", duration_ms=2400, size_bytes=1234,
            part_count=1,
        )
        self.assertIsNotNone(created)
        item = self.repository.get(created["export_id"])
        self.assertEqual(item["production_id"], production_id)
        self.assertEqual(item["manifest"]["version"], manifest["version"])
        self.assertEqual(item["manifest"]["parts"], manifest["parts"])
        self.assertEqual(item["manifest"]["source"], "canonical_parts")
        self.assertEqual(item["renderer"], "test-renderer")
        self.assertEqual(self.repository.list(production_id), [item])

        editor = work.production_editor(production_id)
        self.assertEqual(editor["exports"], [item])
        self.assertEqual(editor["parts"], [])
        before = len(self.repository.list(production_id))
        self.assertIsNone(self.repository.create(
            production_id + 10_000_000, filename="orphan.mp3",
            path="/tmp/orphan.mp3", manifest={}, renderer="test",
            duration_ms=1, size_bytes=1, part_count=1,
        ))
        self.assertEqual(len(self.repository.list(production_id)), before)


class RenderApplicationTests(unittest.TestCase):
    def test_export_finishes_files_before_recording_canonical_history(self):
        part = {"id": 42, "kind": "audio", "title": "Opening",
                "filename": "opening.mp3", "duration_ms": 2000,
                "file_of": None, "file_version_id": None}
        recorded: dict = {}

        class Records:
            @staticmethod
            def production(_production_id):
                return {"id": 6, "name": "Evening Reset"}

            @staticmethod
            def parts(_production_id):
                return [part]

            @staticmethod
            def sound_scene(_production_id):
                return {"document": empty_scene()}

            @staticmethod
            def transcript(_generation_id):
                return None

            @staticmethod
            def create_export(production_id, *, artifact):
                recorded.update({"production_id": production_id,
                                 "artifact": artifact})
                return {"export_id": 91, "generation_id": 150}

        class Workspace:
            @staticmethod
            def duration_for_part(_part):
                return 2000

            @staticmethod
            def finish_export(
                    production_id, production_name, parts, scene, subtitles):
                target = root / "evening-reset.mp3"
                target.write_bytes(b"finished mp3")
                manifest_path = root / "evening-reset.manifest.json"
                manifest_path.write_text("{}")
                return FinishedExport(
                    target=target, manifest_path=manifest_path,
                    caption_paths=(), filename=target.name,
                    manifest={"parts": [{"part_id": parts[0]["id"]}]},
                    renderer="test-renderer", duration_ms=2000,
                    size_bytes=target.stat().st_size,
                    part_count=len(parts), subtitles=subtitles, mixed=False)

            @staticmethod
            def discard_export(_artifact):
                raise AssertionError("successful export must not be discarded")

        with TemporaryDirectory() as folder:
            root = Path(folder)
            result = RenderService(Records(), Workspace()).export(6)

        self.assertEqual(result["export_id"], 91)
        self.assertEqual(recorded["production_id"], 6)
        artifact = recorded["artifact"]
        self.assertEqual(artifact.part_count, 1)
        self.assertEqual(artifact.renderer, "test-renderer")
        self.assertEqual(artifact.manifest["parts"][0]["part_id"], 42)


if __name__ == "__main__":
    unittest.main()
