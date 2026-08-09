"""Real PostgreSQL lifecycle checks for an editable Production document."""

from __future__ import annotations

import unittest
from uuid import uuid4

import psycopg

from audio_studio.application.timeline import TimelineService
from audio_studio.composition.work import work_service as work
from audio_studio.config import settings
from audio_studio.http.work_contracts import ProductionEditorEnvelope
from audio_studio.infrastructure.postgres.production_document import (
    ProductionDocumentRepository,
)
from audio_studio.infrastructure.postgres.timeline import PostgresTimelineRecords
from audio_studio.infrastructure.postgres.venture_assets import (
    VentureAssetRepository,
)


class _TranscriptState:
    def __init__(self):
        self.stale: list[int] = []

    def mark_stale(self, generation_id: int) -> int:
        self.stale.append(generation_id)
        return 1

    def list_for_generation(self, _generation_id: int) -> list[dict]:
        return []


class _Workspace:
    @staticmethod
    def duplicate(_filename: str) -> str:
        return ""

    @staticmethod
    def discard(_filename: str) -> None:
        pass


class ProductionDocumentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            raise unittest.SkipTest(str(error)) from error
        connection.close()

    def setUp(self):
        self.marker = uuid4().hex[:12]
        self.legacy_rows: list[int] = []
        self.venture = work.create("ventures", None, f"Document {self.marker}")
        self.project = work.create(
            "projects", self.venture["id"], f"Project {self.marker}")
        self.first = work.create(
            "productions", self.project["id"], f"First {self.marker}")
        self.second = work.create(
            "productions", self.project["id"], f"Second {self.marker}")
        self.legacy_rows.extend([
            self.venture["id"], self.project["id"],
            self.first["id"], self.second["id"],
        ])
        self.repository = ProductionDocumentRepository()
        self.asset_repository = VentureAssetRepository()
        self.transcripts = _TranscriptState()
        self.timeline = TimelineService(
            PostgresTimelineRecords(
                documents=self.repository, assets=self.asset_repository),
            _Workspace(), self.transcripts)
        self.asset_generation_ids: list[int] = []

    def tearDown(self):
        venture_id = int(self.venture["id"])
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                if self.asset_generation_ids:
                    cursor.execute("DELETE FROM generations WHERE id = ANY(%s)",
                                   (self.asset_generation_ids,))
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
                cursor.execute("""
                    DELETE FROM series WHERE project_id IN (
                      SELECT id FROM work_projects WHERE venture_id = %s)
                """, (venture_id,))
                cursor.execute("DELETE FROM work_projects WHERE venture_id = %s",
                               (venture_id,))
                cursor.execute("DELETE FROM ventures WHERE id = %s", (venture_id,))
                cursor.execute("DELETE FROM projects WHERE id = ANY(%s)",
                               (self.legacy_rows,))
            database.commit()

    def test_part_take_music_move_and_delete_flow(self):
        first_id, second_id = int(self.first["id"]), int(self.second["id"])
        collections = self.asset_repository.collections_for_venture(
            int(self.venture["id"]))
        intro_collection = next(item for item in collections
                                if item["kind"] == "intros")
        music_collection = next(item for item in collections
                                if item["kind"] == "music")
        intro = self.asset_repository.create_uploaded_asset(
            intro_collection["id"], name=f"Intro {self.marker}",
            filename=f"intro-{self.marker}.wav", path=f"/tmp/intro-{self.marker}.wav",
            size_bytes=44, duration_ms=1200, audio_format="wav",
            mime_type="audio/wav")
        music_asset = self.asset_repository.create_uploaded_asset(
            music_collection["id"], name=f"Music {self.marker}",
            filename=f"music-{self.marker}.wav", path=f"/tmp/music-{self.marker}.wav",
            size_bytes=44, duration_ms=30000, audio_format="wav",
            mime_type="audio/wav")
        self.asset_generation_ids.extend([
            intro["generation_id"], music_asset["generation_id"]])

        silence = self.timeline.add_silence(first_id, 2, None)
        draft = self.timeline.add_draft(first_id, {
            "text": "A quiet opening", "voice": "Tina", "engine": "audio",
            "model": "plus", "insert_at": 0,
        })
        parts = self.repository.parts(first_id)
        self.assertEqual([item["id"] for item in parts], [draft["id"], silence["id"]])
        self.assertEqual([item["position"] for item in parts], [0, 1])
        self.assertIsNone(parts[0]["fidelity"])

        linked = self.timeline.insert_asset(first_id, intro["id"], None)
        self.assertEqual(
            self.repository.part(first_id, linked["id"])["kind"], "asset")

        self.timeline.edit_silence(first_id, silence["id"], 3.5)
        edited = next(item for item in self.repository.parts(first_id)
                      if item["id"] == silence["id"])
        self.assertEqual((edited["title"], edited["duration_ms"]), ("3.5", 3500))

        duplicate = self.timeline.duplicate(first_id, draft["id"])
        self.timeline.save_text(first_id, duplicate["id"], {
            "text": "A revised opening", "text_state": "raw",
        })
        self.assertEqual(
            self.repository.generation(duplicate["id"])["text"],
            "A revised opening",
        )

        legacy_id = int(self.first["legacy_container_id"])
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO generations
                        (text, voice, engine, model, format, filename, path,
                         kind, version_of, project_id, fidelity)
                    VALUES ('Archived opening', 'Tina', 'audio', 'plus', 'mp3',
                            '', '', 'draft', %s, %s, '{}'::jsonb) RETURNING id
                """, (draft["id"], legacy_id))
                take_id = int(cursor.fetchone()[0])
            database.commit()
        archived_take = self.timeline.takes(first_id, draft["id"])[0]
        self.assertEqual(archived_take["id"], take_id)
        self.assertIsNone(archived_take["fidelity"])
        promoted = self.timeline.promote(first_id, draft["id"], take_id)
        self.assertTrue(promoted["ok"])
        self.assertEqual(self.transcripts.stale, [draft["id"]])
        self.assertEqual(self.repository.generation(draft["id"])["text"],
                         "Archived opening")

        music = self.timeline.set_music(first_id, {
            "music_of": music_asset["id"],
            "music_volume": .25, "music_start": 1.5,
            "music_fade_in": 3, "music_duck": False,
        })
        self.assertEqual((music["music_of"], music["filename"], music["volume"],
                          music["start"], music["fade_in"], music["duck"]),
                         (music_asset["id"], f"music-{self.marker}.wav",
                          .25, 1.5, 3.0, False))
        removed_music = self.timeline.set_music(first_id, {"music_of": None})
        self.assertIsNone(removed_music["music_of"])
        self.assertEqual(removed_music["filename"], "")

        moved = self.timeline.move_parts(
            first_id, [duplicate["id"]], second_id)
        self.assertEqual(moved["moved"], 1)
        self.assertIsNone(self.repository.part(first_id, duplicate["id"]))
        self.assertIsNotNone(self.repository.part(second_id, duplicate["id"]))

        deleted = self.timeline.delete_parts(second_id, [duplicate["id"]])
        self.assertEqual(deleted["deleted"], 1)
        self.assertIsNone(self.repository.generation(duplicate["id"]))
        editor = work.production_editor(first_id)
        self.assertEqual(len(editor["parts"]), 3)
        self.assertEqual(next(item for item in editor["parts"]
                              if item["id"] == draft["id"])["takes"], 1)
        ProductionEditorEnvelope.model_validate({"data": editor})


if __name__ == "__main__":
    unittest.main()
