"""Real PostgreSQL lifecycle checks for an editable Production document."""

from __future__ import annotations

import json
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
from audio_studio.infrastructure.postgres.jobs import JobRepository
from audio_studio.infrastructure.postgres.accounting import (
    ProductionAccountingRepository,
)
from audio_studio.infrastructure.postgres.timeline import PostgresTimelineRecords
from audio_studio.infrastructure.postgres.sound_scenes import SoundSceneRepository
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
    def __init__(self):
        self.discarded: list[str] = []

    @staticmethod
    def duplicate(_filename: str) -> str:
        return ""

    def discard(self, filename: str) -> None:
        self.discarded.append(filename)


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
        self.workspace = _Workspace()
        self.timeline = TimelineService(
            PostgresTimelineRecords(
                documents=self.repository, assets=self.asset_repository),
            self.workspace, self.transcripts)

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

    def test_part_recording_music_move_and_delete_flow(self):
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
        silence = self.timeline.add_silence(first_id, 2)
        silence_public_id = self.repository.part(
            first_id, silence["id"])["public_id"]
        draft_binding_id = str(uuid4())
        draft = self.timeline.add_draft(first_id, {
            "text": "A quiet opening", "voice": "Tina", "engine": "audio",
            "model": "plus", "authored_role": "Night Guide",
            "binding_id": draft_binding_id,
            "spoken_profile": "spoken_2", "enable_ssml": True,
            "insert_before_part_id": silence_public_id,
        })
        parts = self.repository.parts(first_id)
        self.assertEqual([item["id"] for item in parts], [draft["id"], silence["id"]])
        self.assertEqual([item["position"] for item in parts], [0, 1])
        self.assertEqual(parts[0]["authored_role"], "Night Guide")
        self.assertEqual(
            (parts[0]["spoken_profile"], parts[0]["enable_ssml"]),
            ("spoken_2", True))
        self.assertEqual(parts[0]["binding_id"], draft_binding_id)
        linked = self.timeline.insert_asset(first_id, intro["id"])
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
                    INSERT INTO clips
                        (part_id, source_part_revision, source_script_hash,
                         provider, provider_region, provider_voice_id,
                         model_id, tier, raw_text, spoken_text, filename, path,
                         cost, cost_basis, snapshot)
                    SELECT id, revision, encode(digest('Archived opening','sha256'),'hex'),
                           'alibaba','intl','Cherry','qwen-audio-3.0-tts-plus','plus',
                           'Archived opening','Archived opening',%s,%s,
                           0.123,'actual_usage',
                           '{"engine":"audio","format":"mp3","text_state":"raw"}'::jsonb
                      FROM production_parts WHERE id=%s
                    RETURNING id
                """, (f"retained-{self.marker}.mp3",
                      f"/durable/retained-{self.marker}.mp3", draft["id"]))
                clip_id = int(cursor.fetchone()[0])
                cursor.execute("""
                    UPDATE production_parts
                       SET kind='speech'
                     WHERE id=%s
                """, (draft["id"],))
                cursor.execute("""
                    INSERT INTO jobs
                        (kind,status,cost,production_id,part_id,clip_id,
                         payload,result,detail)
                    VALUES ('speech','ok',0,%s,%s,%s,
                            '{"text":"private authored words"}'::jsonb,
                            '{"filename":"orphan-part-output.mp3"}'::jsonb,
                            'private authored words')
                    RETURNING id
                """, (first_id, draft["id"], clip_id))
                content_job_id = int(cursor.fetchone()[0])
                cursor.execute("""
                    INSERT INTO job_events (job_id,kind,detail)
                    VALUES (%s,'completed','{"text":"private authored words"}'::jsonb)
                """, (content_job_id,))
                cursor.execute("""
                    INSERT INTO provider_attempts
                        (job_id,operation,provider,payload_fingerprint,status,
                         error,diagnostics)
                    VALUES (%s,'speech','alibaba','private-fingerprint',
                            'succeeded','{"private_detail":"private"}'::jsonb,
                            '{"private_diagnostic":"private"}'::jsonb)
                    RETURNING id
                """, (content_job_id,))
                provider_attempt_id = int(cursor.fetchone()[0])
                cursor.execute("""
                    INSERT INTO transcripts
                        (name,text,srt,vtt,part_id,clip_id,source_job_id)
                    VALUES ('private caption','private authored words',
                            'private authored words','private authored words',
                            %s,%s,%s)
                """, (draft["id"], clip_id, content_job_id))
            database.commit()
        recording = next(item for item in self.repository.parts(first_id)
                         if item["id"] == draft["id"])
        self.assertEqual(recording["clip_id"], clip_id)
        self.assertEqual(recording["engine"], "audio")
        self.assertEqual(recording["model"], "qwen-audio-3.0-tts-plus")
        self.assertEqual(recording["tier"], "plus")
        self.assertEqual(recording["recording_text_state"], "raw")
        self.assertEqual(self.repository.generation(draft["id"])["text"],
                         "A quiet opening")

        sound_scenes = SoundSceneRepository()
        current_scene = sound_scenes.get(first_id)
        sound_clip_id = str(uuid4())
        saved_scene = sound_scenes.commit(first_id, current_scene["revision"], {
            "version": 1,
            "tracks": [{"id": "music", "kind": "music", "name": "Music",
                        "muted": False, "clips": [{
                            "id": sound_clip_id, "asset_id": music_asset["id"],
                            "start_ms": 0, "duration_ms": None,
                            "source_offset_ms": 1_500, "gain": .25,
                            "fade_in_ms": 3_000, "fade_out_ms": 4_000,
                            "loop": True, "ducking": False,
                            "anchor": {"kind": "absolute", "position_ms": 0},
                        }]}],
        })
        music_clip = saved_scene["hydrated_document"]["tracks"][0]["clips"][0]
        self.assertEqual(
            (music_clip["asset_id"], music_clip["filename"],
             music_clip["gain"], music_clip["source_offset_ms"],
             music_clip["fade_in_ms"], music_clip["ducking"]),
            (music_asset["id"], f"music-{self.marker}.wav",
             .25, 1_500, 3_000, False),
        )
        undone_scene = sound_scenes.step(first_id, -1)
        self.assertEqual(undone_scene["document"]["tracks"][0]["clips"], [])
        self.assertTrue(undone_scene["can_redo"])
        redone_scene = sound_scenes.step(first_id, 1)
        self.assertEqual(
            redone_scene["document"]["tracks"][0]["clips"][0]["id"],
            sound_clip_id,
        )
        self.assertTrue(redone_scene["can_undo"])

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
                              if item["id"] == draft["id"])["clip_id"],
                         clip_id)
        ProductionEditorEnvelope.model_validate({"data": editor})

        accounting = ProductionAccountingRepository()
        before_delete = accounting.one(first_id)
        self.timeline.delete_parts(first_id, [draft["id"]])
        after_delete = accounting.one(first_id)
        self.assertLess(after_delete["retained_generation_cost"],
                        before_delete["retained_generation_cost"])
        self.assertEqual(after_delete["historical_spend"],
                         before_delete["historical_spend"])
        self.assertLess(after_delete["current_sequence_cost"],
                        before_delete["current_sequence_cost"])
        self.assertIn(f"retained-{self.marker}.mp3", self.workspace.discarded)
        self.assertIn("orphan-part-output.mp3", self.workspace.discarded)
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    SELECT 1 FROM production_parts WHERE id=%s
                """, (draft["id"],))
                self.assertIsNone(cursor.fetchone())
                cursor.execute("""
                    SELECT 1 FROM clips WHERE id=%s
                """, (clip_id,))
                self.assertIsNone(cursor.fetchone())
                cursor.execute("""
                    SELECT part_id, clip_id, payload, result, cost, detail
                      FROM jobs
                     WHERE production_id=%s
                       AND cost_basis='historical_deleted_part'
                     ORDER BY id DESC LIMIT 1
                """, (first_id,))
                spend_job = cursor.fetchone()
                self.assertIsNotNone(spend_job)
                self.assertEqual(spend_job[:4], (None, None, {}, {}))
                self.assertEqual(float(spend_job[4]), 0.123)
                self.assertEqual(spend_job[5], "Deleted Part provider spend")
                cursor.execute("""
                    SELECT part_id, clip_id, payload, result, chars, detail, error
                      FROM jobs WHERE id=%s
                """, (content_job_id,))
                sanitized_job = cursor.fetchone()
                self.assertEqual(
                    sanitized_job,
                    (None, None, {}, {}, 0, "Deleted Part activity", None),
                )
                cursor.execute("SELECT 1 FROM job_events WHERE job_id=%s",
                               (content_job_id,))
                self.assertIsNone(cursor.fetchone())
                cursor.execute("""
                    SELECT error, diagnostics FROM provider_attempts WHERE id=%s
                """, (provider_attempt_id,))
                self.assertEqual(cursor.fetchone(), ({}, {}))
                cursor.execute("SELECT 1 FROM transcripts WHERE source_job_id=%s",
                               (content_job_id,))
                self.assertIsNone(cursor.fetchone())

        # New Parts reuse the contiguous sequence after physical deletion.
        first_active = self.repository.parts(first_id)[0]
        replacement = self.timeline.add_silence(
            first_id, 1, first_active["public_id"])
        active = self.repository.parts(first_id)
        self.assertEqual(active[0]["id"], replacement["id"])
        self.assertEqual([part["position"] for part in active],
                         list(range(len(active))))

    def test_reorder_locks_the_active_sequence_and_persists_exact_order(self):
        production_id = int(self.first["id"])
        first = self.timeline.add_silence(production_id, 1)
        second = self.timeline.add_silence(production_id, 2)
        third = self.timeline.add_silence(production_id, 3)
        self.assertTrue(self.timeline.reorder(
            production_id, [third["id"], first["id"], second["id"]]))
        self.assertEqual(
            [item["id"] for item in self.repository.parts(production_id)],
            [third["id"], first["id"], second["id"]],
        )

    def test_editorial_revision_marks_the_active_recording_outdated(self):
        production_id = int(self.first["id"])
        draft = self.timeline.add_draft(production_id, {
            "text": "Original words",
        })
        part = self.repository.part(production_id, draft["id"])
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO clips
                        (part_id, source_part_revision, source_script_hash,
                         provider, provider_region, provider_voice_id,
                         model_id, tier, raw_text, spoken_text, filename, path,
                         snapshot)
                    VALUES (%s,%s,encode(digest('Original words','sha256'),'hex'),
                            'alibaba','intl','Cherry','qwen-audio-3.0-tts-plus','plus',
                            'Original words','Original words','','',
                            '{"engine":"audio","format":"mp3"}'::jsonb)
                    RETURNING id
                """, (draft["id"], part["revision"]))
                clip_id = int(cursor.fetchone()[0])
                cursor.execute("""
                    UPDATE production_parts
                       SET kind='speech'
                     WHERE id=%s
                """, (draft["id"],))
            database.commit()

        role_changed = self.timeline.save_editorial(
            production_id, draft["id"], part["revision"],
            {"authored_role": "  narrator  "})
        self.assertEqual(
            (role_changed["revision"], role_changed["outdated"]),
            (1, False))
        role_part = self.repository.part(production_id, draft["id"])
        self.assertEqual(
            (role_part["authored_role"], role_part["revision"]),
            ("narrator", 1))

        changed = self.timeline.save_editorial(
            production_id, draft["id"], role_changed["revision"],
            {"script": "Revised words"})
        self.assertEqual((changed["revision"], changed["outdated"]), (2, True))
        current = self.repository.part(production_id, draft["id"])
        self.assertEqual((current["revision"], current["clip_id"]),
                         (2, clip_id))
        unchanged = self.timeline.save_editorial(
            production_id, draft["id"], current["revision"],
            {"script": "Revised words"})
        self.assertEqual((unchanged["changed"], unchanged["outdated"]),
                         (False, True))

    def test_active_recording_projection_is_immutable_and_caption_relevant(self):
        production_id = int(self.first["id"])
        draft = self.timeline.add_draft(production_id, {
            "text": "The selected performance stays true",
            "voice": "future-eve", "engine": "audio", "model": "flash",
        })
        part = self.repository.part(production_id, draft["id"])
        filename = f"recording-{self.marker}.mp3"
        snapshot = {
            "engine": "qwen_tts", "model": "qwen3-tts-vc-2026-01-22",
            "voice_name": "Maya", "text_state": "shaped",
            "language": "English", "capability_id": "expressive-tags",
        }
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO clips
                        (part_id, source_part_revision, source_script_hash,
                         provider, provider_region, provider_voice_id,
                         model_id, tier, language, raw_text, spoken_text,
                         tagged_text, filename, path, cost, cost_basis,
                         snapshot, voice_name_snapshot)
                    VALUES (%s,%s,encode(digest(%s,'sha256'),'hex'),
                            'alibaba','intl','provider-current',%s,'plus',%s,
                            'Raw words','Spoken words','<happy>Tagged words</happy>',
                            %s,%s,0.01,'actual_usage',%s::jsonb,%s)
                    RETURNING id
                """, (
                    draft["id"], part["revision"],
                    "The selected performance stays true", snapshot["model"],
                    snapshot["language"], filename, f"/durable/{filename}",
                    json.dumps(snapshot), snapshot["voice_name"],
                ))
                recording_id = int(cursor.fetchone()[0])
                cursor.execute("""
                    UPDATE production_parts
                       SET kind='speech'
                     WHERE id=%s
                """, (draft["id"],))
            database.commit()

        jobs = JobRepository()
        selected_caption, _ = jobs.enqueue(
            "transcribe", {
                "part_id": draft["id"], "production_id": production_id,
                "file": filename,
            }, idempotency_key=f"selected-caption-{self.marker}",
            production_id=production_id, part_id=draft["id"])
        obsolete_caption, _ = jobs.enqueue(
            "transcribe", {
                "part_id": draft["id"], "production_id": production_id,
                "file": f"obsolete-{self.marker}.mp3",
            }, idempotency_key=f"obsolete-caption-{self.marker}",
            production_id=production_id, part_id=draft["id"])
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    UPDATE jobs SET status='running', started_at=now()
                     WHERE id=%s
                """, (selected_caption.id,))
                cursor.execute("""
                    UPDATE jobs SET status='failed', result=%s::jsonb,
                           error='Obsolete clip failed', finished_at=now()
                     WHERE id=%s
                """, (
                    json.dumps({"clip_id": 999999999}),
                    obsolete_caption.id,
                ))
            database.commit()

        projected = self.repository.parts(production_id)[0]
        self.assertEqual(projected["recording_text_state"], "shaped")
        self.assertEqual(projected["text_raw"], "Raw words")
        self.assertEqual(projected["text_shaped"], "Spoken words")
        self.assertEqual(projected["text_tagged"],
                         "<happy>Tagged words</happy>")
        self.assertEqual(projected["text_state"], "shaped")
        self.assertEqual(projected["voice_name"], "Maya")
        self.assertEqual(projected["model"], "qwen3-tts-vc-2026-01-22")
        self.assertEqual(projected["language"], "English")
        self.assertEqual(projected["caption_job"]["id"],
                         str(selected_caption.public_id))
        self.assertEqual(projected["caption_job"]["status"], "running")

        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    UPDATE clips SET snapshot = snapshot - 'text_state'
                     WHERE id=%s
                """, (recording_id,))
            database.commit()
        historical = self.repository.parts(production_id)[0]
        self.assertIsNone(historical["recording_text_state"])

if __name__ == "__main__":
    unittest.main()
