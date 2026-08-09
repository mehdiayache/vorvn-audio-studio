"""Real PostgreSQL lifecycle checks for immutable Production Exports."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from uuid import uuid4

import psycopg

from audio_studio.application import renders, work
from audio_studio.config import settings
from audio_studio.infrastructure.postgres.exports import ProductionExportRepository


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
        self.venture = work.create("ventures", None, f"Export {self.marker}")
        self.project = work.create(
            "projects", self.venture["id"], f"Project {self.marker}")
        self.production = work.create(
            "productions", self.project["id"], f"Production {self.marker}")
        self.repository = ProductionExportRepository()

    def tearDown(self):
        venture_id = int(self.venture["id"])
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    DELETE FROM generations WHERE production_id IN (
                      SELECT production.id FROM productions production
                      JOIN work_projects project ON project.id = production.project_id
                      WHERE project.venture_id = %s)
                """, (venture_id,))
                cursor.execute("""
                    DELETE FROM productions WHERE project_id IN (
                      SELECT id FROM work_projects WHERE venture_id = %s)
                """, (venture_id,))
                cursor.execute("DELETE FROM work_projects WHERE venture_id = %s",
                               (venture_id,))
                cursor.execute("DELETE FROM ventures WHERE id = %s", (venture_id,))
                cursor.execute("DELETE FROM projects WHERE id = ANY(%s)", ([
                    self.venture["id"], self.project["id"],
                    self.production["id"],
                ],))
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
        self.assertEqual(item["generation_id"], created["generation_id"])
        self.assertEqual(item["manifest"], manifest)
        self.assertEqual(item["renderer"], "test-renderer")
        self.assertEqual(self.repository.list(production_id), [item])

        editor = work.production_editor(production_id)
        self.assertEqual(editor["exports"], [item])
        self.assertEqual(editor["parts"], [])
        with psycopg.connect(settings.database_url) as database:
            row = database.execute(
                "SELECT kind, production_id FROM generations WHERE id = %s",
                (created["generation_id"],),
            ).fetchone()
        self.assertEqual(row, ("stitch", production_id))

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
                "asset_of": None, "asset_version_id": None}
        recorded: dict = {}

        def sequence(_parts, target: Path):
            target.write_bytes(b"finished mp3")
            return ([{"position": 0, "part_id": 42, "kind": "audio",
                      "filename": "opening.mp3", "asset_of": None}],
                    "test-renderer")

        def create(production_id: int, **values):
            recorded.update({"production_id": production_id, **values})
            return {"export_id": 91, "generation_id": 150}

        with TemporaryDirectory() as folder, \
                patch.object(renders, "_output", return_value=Path(folder)), \
                patch.object(renders, "_parts", return_value=(
                    {"id": 6, "name": "Evening Reset"}, [part], [])), \
                patch.object(renders, "_sequence", side_effect=sequence), \
                patch.object(renders, "_measure", return_value=2000), \
                patch.object(renders.document_repository, "music", return_value={}), \
                patch.object(renders.transcript_repository,
                             "source_for_generation", return_value=None), \
                patch.object(renders.export_repository, "create",
                             side_effect=create):
            result = renders.export(6)

        self.assertEqual(result["export_id"], 91)
        self.assertEqual(recorded["production_id"], 6)
        self.assertEqual(recorded["part_count"], 1)
        self.assertEqual(recorded["renderer"], "test-renderer")
        self.assertEqual(recorded["manifest"]["parts"][0]["part_id"], 42)


if __name__ == "__main__":
    unittest.main()
