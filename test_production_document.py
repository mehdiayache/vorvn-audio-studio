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
from audio_studio.infrastructure.postgres.accounting import (
    ProductionAccountingRepository,
)
from audio_studio.infrastructure.postgres.timeline import PostgresTimelineRecords
from audio_studio.infrastructure.postgres.venture_assets import (
    VentureAssetRepository,
)


class _TranscriptState:
    def __init__(self):
        self.stale: list[int] = []

    def mark_stale(self, part_id: int) -> int:
        self.stale.append(part_id)
        return 1

    def list_for_part(self, _part_id: int) -> list[dict]:
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
        linked_part = next(item for item in self.repository.parts(first_id)
                           if item["id"] == linked["id"])
        self.assertEqual(linked_part["kind"], "asset")
        self.assertEqual(linked_part["asset_kind"], "intros")
        self.assertEqual(linked_part["asset_collection"], "Intros")

        self.timeline.edit_silence(first_id, silence["id"], 3.5)
        edited = next(item for item in self.repository.parts(first_id)
                      if item["id"] == silence["id"])
        self.assertEqual((edited["title"], edited["duration_ms"]), ("3.5", 3500))

        duplicate = self.timeline.duplicate(first_id, draft["id"])
        duplicate_part = self.repository.part(first_id, duplicate["id"])
        self.timeline.save_editorial(
            first_id, duplicate["id"], duplicate_part["revision"],
            {"script": "A revised opening"})
        self.assertEqual(
            self.repository.generation(duplicate["id"])["text"],
            "A revised opening",
        )
        self.timeline.save_draft(first_id, duplicate["id"], {
            "text_raw": "A revised opening",
            "text_shaped": "A softly revised opening",
            "text_state": "shaped",
        })
        self.assertEqual(
            self.repository.generation(duplicate["id"])["text"],
            "A revised opening",
        )

        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO takes
                        (part_id, source_part_revision, source_script_hash,
                         provider, provider_region, provider_voice_id,
                         model_id, tier, raw_text, spoken_text, filename, path,
                         cost, cost_basis, snapshot)
                    SELECT id, revision, encode(digest('Archived opening','sha256'),'hex'),
                           'alibaba','intl','Tina','qwen3.5-omni-plus','plus',
                           'Archived opening','Archived opening',%s,%s,
                           0.123,'actual_usage',
                           '{"engine":"omni","format":"mp3"}'::jsonb
                      FROM production_parts WHERE id=%s
                    RETURNING id
                """, (f"retained-{self.marker}.mp3",
                      f"/durable/retained-{self.marker}.mp3", draft["id"]))
                take_id = int(cursor.fetchone()[0])
            database.commit()
        archived_take = self.timeline.takes(first_id, draft["id"])[0]
        self.assertEqual(archived_take["id"], take_id)
        self.assertEqual(archived_take["engine"], "omni")
        self.assertEqual(archived_take["model"], "qwen3.5-omni-plus")
        self.assertEqual(archived_take["tier"], "plus")
        self.assertIsNone(archived_take["fidelity"])
        current_draft = self.repository.part(first_id, draft["id"])
        review = self.timeline.promote(
            first_id, draft["id"], take_id, current_draft["revision"])
        self.assertTrue(review["needs_confirmation"])
        promoted = self.timeline.promote(
            first_id, draft["id"], take_id, current_draft["revision"], True)
        self.assertTrue(promoted["ok"])
        self.assertEqual(self.transcripts.stale, [draft["id"]])
        self.assertEqual(self.repository.generation(draft["id"])["text"],
                         "A quiet opening")

        music = self.timeline.set_music(first_id, {
            "music_of": music_asset["id"],
            "volume": .25, "start": 1.5,
            "fade_in": 3, "duck": False,
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
                              if item["id"] == draft["id"])["takes"], 0)
        ProductionEditorEnvelope.model_validate({"data": editor})

        accounting = ProductionAccountingRepository()
        before_delete = accounting.one(first_id)
        self.timeline.delete_parts(first_id, [draft["id"]])
        after_delete = accounting.one(first_id)
        self.assertEqual(after_delete["retained_generation_cost"],
                         before_delete["retained_generation_cost"])
        self.assertEqual(after_delete["historical_spend"],
                         before_delete["historical_spend"])
        self.assertLess(after_delete["current_sequence_cost"],
                        before_delete["current_sequence_cost"])
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    SELECT archived_at IS NOT NULL, position,
                           archived_position, selected_take_id
                      FROM production_parts WHERE id=%s
                """, (draft["id"],))
                archived, position, archived_position, selected = cursor.fetchone()
                self.assertTrue(archived)
                self.assertIsNone(position)
                self.assertIsNotNone(archived_position)
                self.assertIsNone(selected)
                cursor.execute("""
                    SELECT filename, cost FROM takes WHERE id=%s
                """, (take_id,))
                retained_filename, retained_cost = cursor.fetchone()
                self.assertEqual(retained_filename,
                                 f"retained-{self.marker}.mp3")
                self.assertEqual(float(retained_cost), 0.123)

        # Reusing the archived slot must commit cleanly; this is the exact
        # regression that previously returned HTTP 500 before provider work.
        replacement = self.timeline.add_silence(first_id, 1, 0)
        active = self.repository.parts(first_id)
        self.assertEqual(active[0]["id"], replacement["id"])
        self.assertEqual([part["position"] for part in active],
                         list(range(len(active))))

    def test_editorial_revision_and_outdated_take_require_human_confirmation(self):
        production_id = int(self.first["id"])
        draft = self.timeline.add_draft(production_id, {
            "text": "Original words", "insert_at": 0,
        })
        part = self.repository.part(production_id, draft["id"])
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO takes
                        (part_id, source_part_revision, source_script_hash,
                         provider, provider_region, provider_voice_id,
                         model_id, tier, raw_text, spoken_text, filename, path,
                         snapshot)
                    VALUES (%s,%s,encode(digest('Original words','sha256'),'hex'),
                            'alibaba','intl','Tina','qwen3.5-omni-plus','plus',
                            'Original words','Original words','','',
                            '{"engine":"omni","format":"mp3"}'::jsonb)
                    RETURNING id
                """, (draft["id"], part["revision"]))
                take_id = int(cursor.fetchone()[0])
            database.commit()

        changed = self.timeline.save_editorial(
            production_id, draft["id"], part["revision"],
            {"script": "Revised words"})
        self.assertEqual((changed["revision"], changed["outdated"]), (2, False))
        review = self.timeline.promote(
            production_id, draft["id"], take_id, changed["revision"])
        self.assertTrue(review["needs_confirmation"])
        self.assertEqual(self.transcripts.stale, [])
        selected = self.timeline.promote(
            production_id, draft["id"], take_id, changed["revision"], True)
        self.assertTrue(selected["outdated"])
        current = self.repository.part(production_id, draft["id"])
        self.assertEqual((current["revision"], current["selected_take_id"]),
                         (2, take_id))
        unchanged = self.timeline.save_editorial(
            production_id, draft["id"], current["revision"],
            {"script": "Revised words"})
        self.assertEqual((unchanged["changed"], unchanged["outdated"]),
                         (False, True))

if __name__ == "__main__":
    unittest.main()
