"""Real PostgreSQL checks for canonical reusable Venture Assets."""

from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from uuid import uuid4

import psycopg

from audio_studio.application.uploads import UploadService
from audio_studio.config import settings
from audio_studio.infrastructure import upload_workspace
from audio_studio.infrastructure.postgres.uploads import PostgresUploadRecords
from audio_studio.infrastructure.postgres.venture_assets import (
    VentureAssetRepository,
)
from audio_studio.infrastructure.upload_workspace import LocalUploadWorkspace


class VentureAssetRepositoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            raise unittest.SkipTest(str(error)) from error
        connection.close()

    def setUp(self):
        self.repository = VentureAssetRepository()
        self.marker = uuid4().hex
        self.fixture_base = 8_000_000_000 + int(self.marker[:8], 16) * 10
        self.venture_id = self.fixture_base
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO projects
                        (id, name, level, container_type)
                    VALUES (%s, %s, 'venture', 'venture')
                """, (self.venture_id, f"Asset fixture {self.marker}"))
            database.commit()

    def tearDown(self):
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                if self.venture_id is not None:
                    cursor.execute("DELETE FROM ventures WHERE id = %s",
                                   (self.venture_id,))
                    cursor.execute("DELETE FROM projects WHERE id = %s",
                                   (self.venture_id,))
            database.commit()

    def _production(self) -> int:
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO projects
                        (id, parent_id, name, level, container_type)
                    VALUES (%s, %s, %s, 'project', 'project')
                """, (self.fixture_base + 1, self.venture_id,
                      f"Project {self.marker}"))
                project_id = self.fixture_base + 1
                cursor.execute("""
                    INSERT INTO projects
                        (id, parent_id, name, level, container_type)
                    VALUES (%s, %s, %s, 'folder', 'production')
                """, (self.fixture_base + 2, project_id,
                      f"Production {self.marker}"))
                production_id = self.fixture_base + 2
            database.commit()
        return production_id

    def test_collections_are_fixed_typed_and_idempotent(self):
        first = self.repository.ensure_collections(self.venture_id)
        second = self.repository.ensure_collections(self.venture_id)
        self.assertEqual(first, second)
        self.assertEqual({item["kind"] for item in first},
                         {"intros", "outros", "music", "stingers"})
        self.assertEqual(len(first), 4)
        for item in first:
            self.assertEqual(
                self.repository.collection(item["id"])["venture_id"],
                self.venture_id,
            )

    def test_uploaded_asset_keeps_identity_version_and_ownership(self):
        collections = self.repository.ensure_collections(self.venture_id)
        music = next(item for item in collections if item["kind"] == "music")
        with TemporaryDirectory() as output:
            root = Path(output)
            source = root / "incoming.upload"
            source.write_bytes(b"RIFF" + bytes(40))
            service = UploadService(
                LocalUploadWorkspace(root=root, output=root,
                                     references=root / "references"),
                PostgresUploadRecords(assets=self.repository),
            )
            with patch.object(upload_workspace, "_audio_duration_ms",
                              return_value=1200):
                created = service.save_asset_file(
                    music["id"], source, source.stat().st_size,
                    "Quiet bed.wav")
            self.assertTrue((Path(output) / created["filename"]).is_file())
        asset = self.repository.get(created["id"])
        self.assertEqual(
            (asset["venture_id"], asset["collection_id"], asset["kind"],
             asset["version_id"], asset["filename"]),
            (self.venture_id, music["id"], "music", created["version_id"],
             created["filename"]),
        )
        listed = self.repository.list_for_venture(self.venture_id)
        self.assertEqual([item["id"] for item in listed], [created["id"]])
        context = self.repository.library_context(created["id"])
        self.assertEqual(
            (context["venture_id"], context["collection"]),
            (self.venture_id, "Music"),
        )
        production_id = self._production()
        self.assertTrue(self.repository.allowed_for_production(
            production_id, created["id"], {"music"}))
        self.assertFalse(self.repository.allowed_for_production(
            production_id, created["id"], {"intros"}))
        self.assertFalse(self.repository.allowed_for_production(
            2_147_483_647, created["id"], {"music"}))

    def test_unknown_collection_cannot_create_an_orphan(self):
        self.assertIsNone(self.repository.create_uploaded_asset(
            2_147_483_647, name="Orphan", filename="orphan.wav",
            path="/tmp/orphan.wav", size_bytes=44, duration_ms=100,
            audio_format="wav", mime_type="audio/wav",
        ))


if __name__ == "__main__":
    unittest.main()
