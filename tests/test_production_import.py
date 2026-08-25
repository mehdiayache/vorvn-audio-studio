"""Lean V1 Production import contracts; no provider calls."""

from __future__ import annotations

import json
from pathlib import Path
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
import psycopg

from audio_studio.application.timeline import TimelineError, TimelineService
from audio_studio.composition.work import work_service as work
from audio_studio.config import settings
from audio_studio.http.app import app
from audio_studio.http.routers import timeline as timeline_router
from audio_studio.infrastructure.postgres.production_document import (
    ProductionDocumentRepository,
)
from audio_studio.infrastructure.postgres.speech import (
    SpeechRepository as PostgresSpeechRepository,
)
from audio_studio.infrastructure.postgres.timeline import PostgresTimelineRecords


FIXTURE = Path(__file__).parent / "fixtures" / "esther-production-import-v1.json"


class _Workspace:
    @staticmethod
    def duplicate(_filename: str) -> str:
        return ""

    @staticmethod
    def discard(_filename: str) -> None:
        pass


class _Transcripts:
    @staticmethod
    def mark_stale(_part_id: int) -> int:
        return 0

    @staticmethod
    def list_for_part(_part_id: int) -> list[dict]:
        return []


class ProductionImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            raise unittest.SkipTest(str(error)) from error
        connection.close()

    def setUp(self):
        marker = uuid4().hex
        self.identity_ids = {
            role: f"import_{role}_{marker}"
            for role in ("narrator", "esther", "mordecai", "king")
        }
        self.venture = work.create("ventures", None, f"Import {marker[:8]}")
        self.project = work.create(
            "projects", self.venture["id"], f"Project {marker[:8]}")
        self.production = work.create(
            "productions", self.project["id"], f"Production {marker[:8]}")
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                for role, identity_id in self.identity_ids.items():
                    cursor.execute(
                        "INSERT INTO voice_identities (id,name) VALUES (%s,%s)",
                        (identity_id, role.title()),
                    )
                    cursor.execute("""
                        INSERT INTO voice_bindings
                            (provider_voice_id, model_id, identity_id, engine,
                             tier, source, status, languages)
                        VALUES (%s,%s,%s,'fixture','fixture','custom','active',
                                '["English"]'::jsonb)
                    """, (f"provider-{identity_id}", f"model-{marker}", identity_id))
            database.commit()
        self.repository = ProductionDocumentRepository()
        self.timeline = TimelineService(
            PostgresTimelineRecords(documents=self.repository),
            _Workspace(), _Transcripts(),
        )
        self.document = json.loads(FIXTURE.read_text())

    def tearDown(self):
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM productions WHERE id=%s",
                    (self.production["id"],),
                )
                cursor.execute(
                    "DELETE FROM work_projects WHERE id=%s",
                    (self.project["id"],),
                )
                cursor.execute(
                    "DELETE FROM ventures WHERE id=%s",
                    (self.venture["id"],),
                )
                cursor.execute(
                    "DELETE FROM voice_bindings WHERE identity_id=ANY(%s)",
                    (list(self.identity_ids.values()),),
                )
                cursor.execute(
                    "DELETE FROM voice_identities WHERE id=ANY(%s)",
                    (list(self.identity_ids.values()),),
                )
            database.commit()

    def _active_part_count(self) -> int:
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute(
                    "SELECT count(*) FROM production_parts "
                    "WHERE production_id=%s AND archived_at IS NULL",
                    (self.production["id"],),
                )
                return int(cursor.fetchone()[0])

    def test_mixed_import_appends_in_order_and_restores_draft_truth(self):
        result = self.timeline.import_document(
            self.production["id"], self.document, self.identity_ids)
        self.assertEqual(result, {"items": 10, "speech": 7, "silence": 3})
        parts = self.repository.parts(self.production["id"])
        self.assertEqual(
            [part["kind"] for part in parts],
            [item["type"] if item["type"] == "silence" else "draft"
             for item in self.document["items"]],
        )
        speech_items = [item for item in self.document["items"]
                        if item["type"] == "speech"]
        drafts = [part for part in parts if part["kind"] == "draft"]
        for source, draft in zip(speech_items, drafts, strict=True):
            self.assertEqual(draft["text"], source["text"])
            self.assertEqual(draft["authored_role"], source["role"])
            self.assertEqual(draft["text_raw"], source["text"])
            self.assertIsNone(draft["text_shaped"])
            self.assertIsNone(draft["text_tagged"])
            self.assertEqual(draft["text_state"], "raw")
            self.assertEqual(
                draft["voice_identity_id"], self.identity_ids[source["role"]])
            self.assertEqual(draft["language"], source["language"])
            self.assertEqual(draft["speech_mode"], "exact")
            self.assertEqual(draft["instruction"], source["instruction"])
            self.assertEqual(draft["rate"], 1)
            self.assertEqual(draft["pitch"], 1)
            self.assertEqual(draft["volume"], 50)
            self.assertEqual(draft["seed"], 0)
            self.assertEqual(draft["format"], "mp3")
            self.assertIsNone(draft["binding_id"])
            self.assertIsNone(draft["catalogue_voice_id"])
            self.assertIsNone(draft["capability_id"])

        part_ids = [part["id"] for part in parts]
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute(
                    "SELECT count(*) FROM clips WHERE part_id=ANY(%s)",
                    (part_ids,),
                )
                self.assertEqual(cursor.fetchone()[0], 0)
                cursor.execute(
                    "SELECT count(*) FROM jobs WHERE part_id=ANY(%s)",
                    (part_ids,),
                )
                self.assertEqual(cursor.fetchone()[0], 0)
                cursor.execute(
                    "SELECT authored_role FROM production_parts "
                    "WHERE production_id=%s AND kind='draft' ORDER BY position",
                    (self.production["id"],),
                )
                self.assertEqual(
                    [row[0] for row in cursor.fetchall()],
                    [item["role"] for item in speech_items],
                )

    def test_lean_speech_defaults_and_normalized_roles_are_canonical(self):
        document = {
            "schema": "audio-studio-production-import",
            "version": 1,
            "title": "Lean story",
            "items": [
                {"type": "speech", "role": " Narrator ",
                 "text": "The room became quiet."},
                {"type": "speech", "role": "narrator",
                 "text": "The story began."},
            ],
        }

        result = self.timeline.import_document(
            self.production["id"], document,
            {"NARRATOR": self.identity_ids["narrator"]},
        )

        self.assertEqual(result, {"items": 2, "speech": 2, "silence": 0})
        parts = self.repository.parts(self.production["id"])
        self.assertEqual([part["authored_role"] for part in parts],
                         ["Narrator", "Narrator"])
        for part in parts:
            self.assertEqual(part["language"], "Auto")
            self.assertEqual(part["speech_mode"], "exact")
            self.assertEqual(part["instruction"], "")
            self.assertEqual(part["rate"], 1)
            self.assertEqual(part["pitch"], 1)
            self.assertEqual(part["volume"], 50)
            self.assertEqual(part["seed"], 0)
            self.assertEqual(part["format"], "mp3")
            self.assertEqual(part["voice_identity_id"],
                             self.identity_ids["narrator"])

    def test_invalid_document_and_missing_mapping_mutate_nothing(self):
        invalid = json.loads(json.dumps(self.document))
        invalid["items"][3]["text"] = "   "
        with self.assertRaisesRegex(TimelineError, "Item 4: text"):
            self.timeline.import_document(
                self.production["id"], invalid, self.identity_ids)
        self.assertEqual(self._active_part_count(), 0)

        incomplete = dict(self.identity_ids)
        incomplete.pop("esther")
        with self.assertRaisesRegex(TimelineError, "Missing: esther"):
            self.timeline.import_document(
                self.production["id"], self.document, incomplete)
        self.assertEqual(self._active_part_count(), 0)

    def test_invalid_owned_voice_rolls_back_the_whole_import(self):
        mappings = dict(self.identity_ids)
        mappings["king"] = "not-an-owned-voice"
        with self.assertRaisesRegex(TimelineError, "active owned Voice"):
            self.timeline.import_document(
                self.production["id"], self.document, mappings)
        self.assertEqual(self._active_part_count(), 0)

    def test_recording_again_atomically_keeps_one_active_clip(self):
        self.timeline.import_document(
            self.production["id"], self.document, self.identity_ids)
        part = next(item for item in self.repository.parts(
            self.production["id"]) if item["kind"] == "draft")
        speech = PostgresSpeechRepository()

        def recording(filename: str, text: str) -> dict:
            tagged = f"[serious] {text}"
            return {
                "text": tagged, "text_raw": part["text"],
                "text_shaped": text, "text_tagged": tagged,
                "text_state": "tagged", "filename": filename,
                "path": f"/fixture/{filename}", "size_bytes": 12,
                "duration_ms": 1200, "format": "mp3",
                "language": "English", "voice": "fixture-voice",
                "model": "fixture-model", "tier": "fixture",
                "_provider_transcript": {
                    "name": filename, "source_url": f"/audio/{filename}",
                    "audio_url": f"/audio/{filename}", "language": "English",
                    "duration_ms": 1200, "text": text, "srt": "fixture srt",
                    "vtt": "fixture vtt", "model": "fixture-model",
                    "provider_region": "intl", "catalog_rate": 0,
                    "catalog_cost": 0, "cost_basis": "included_with_speech",
                    "timing_source": "provider_word_timestamps",
                    "sentences": [{"start": 0, "end": 1200, "text": text,
                                   "words": [{"start": 0, "end": 1200,
                                              "text": text}]}],
                },
            }

        first = speech.attach_clip(
            part["id"], self.production["id"], part["revision"],
            recording("first.mp3", part["text"]))
        second = speech.attach_clip(
            part["id"], self.production["id"], part["revision"],
            recording("second.mp3", part["text"]))

        self.assertEqual(first["replaced_filename"], "")
        self.assertEqual(second["replaced_filename"], "first.mp3")
        self.assertIsNotNone(first["transcript_id"])
        self.assertIsNotNone(second["transcript_id"])
        with psycopg.connect(settings.database_url) as database:
            rows = database.execute(
                "SELECT id,filename,snapshot FROM clips WHERE part_id=%s",
                (part["id"],),
            ).fetchall()
            transcript_rows = database.execute(
                "SELECT id,clip_id,stale,timing_source FROM transcripts "
                "WHERE part_id=%s ORDER BY created_at",
                (part["id"],),
            ).fetchall()
        self.assertEqual([(row[0], row[1]) for row in rows],
                         [(second["clip_id"], "second.mp3")])
        self.assertEqual(rows[0][2]["text_state"], "tagged")
        self.assertEqual(rows[0][2]["text_raw"], part["text"])
        self.assertEqual(rows[0][2]["text_shaped"], part["text"])
        self.assertEqual(rows[0][2]["text_tagged"],
                         f"[serious] {part['text']}")
        self.assertEqual(
            [(row[1], row[2], row[3]) for row in transcript_rows],
            [(None, True, "provider_word_timestamps"),
             (second["clip_id"], False, "provider_word_timestamps")],
        )
        recorded = self.repository.parts(self.production["id"])[0]
        self.assertEqual(recorded["authored_role"],
                         self.document["items"][0]["role"])
        self.assertEqual(recorded["text_state"], "tagged")
        self.assertEqual(recorded["text_raw"], part["text"])
        self.assertEqual(recorded["text_shaped"], part["text"])
        self.assertEqual(recorded["text_tagged"],
                         f"[serious] {part['text']}")
        self.assertTrue(recorded["subtitled"])
        self.assertFalse(recorded["subtitles_stale"])
        self.assertEqual(recorded["caption_source_language"], "English")


class ProductionImportHttpTests(unittest.TestCase):
    def test_endpoint_returns_counts_and_rejects_unknown_item_fields(self):
        client = TestClient(app)
        document = json.loads(FIXTURE.read_text())
        roles = {role: f"voice-{role}" for role in
                 {item["role"] for item in document["items"]
                  if item["type"] == "speech"}}
        with patch.object(
                timeline_router.timeline_service, "import_document",
                return_value={"items": 10, "speech": 7, "silence": 3}) as run:
            response = client.post(
                "/api/v1/productions/7/import",
                json={"document": document, "role_voices": roles},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json()["data"],
            {"items": 10, "speech": 7, "silence": 3},
        )
        run.assert_called_once()

        document["items"][1]["provider"] = "forbidden"
        with patch.object(
                timeline_router.timeline_service,
                "import_document") as rejected:
            response = client.post(
                "/api/v1/productions/7/import",
                json={"document": document, "role_voices": roles},
            )
        self.assertEqual(response.status_code, 422, response.text)
        location = response.json()["error"]["details"]["fields"][0]["location"]
        self.assertIn("1", location)
        self.assertIn("provider", location)
        rejected.assert_not_called()

    def test_endpoint_accepts_long_creative_direction(self):
        client = TestClient(app)
        document = json.loads(FIXTURE.read_text())
        document["items"][0]["instruction"] = (
            "Warm, intimate bedtime narration with natural pauses and "
            "restrained cinematic tension. " * 30
        )
        roles = {role: f"voice-{role}" for role in
                 {item["role"] for item in document["items"]
                  if item["type"] == "speech"}}
        with patch.object(
                timeline_router.timeline_service, "import_document",
                return_value={"items": 10, "speech": 7, "silence": 3}) as run:
            response = client.post(
                "/api/v1/productions/7/import",
                json={"document": document, "role_voices": roles},
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            run.call_args.args[1]["items"][0]["instruction"],
            document["items"][0]["instruction"],
        )

    def test_endpoint_does_not_invent_generation_configuration(self):
        client = TestClient(app)
        document = {
            "schema": "audio-studio-production-import",
            "version": 1,
            "title": "Lean story",
            "items": [{
                "type": "speech", "role": "Narrator",
                "text": "The room became quiet.",
            }],
        }
        with patch.object(
                timeline_router.timeline_service, "import_document",
                return_value={"items": 1, "speech": 1, "silence": 0}) as run:
            response = client.post(
                "/api/v1/productions/7/import",
                json={"document": document,
                      "role_voices": {"Narrator": "voice-narrator"}},
            )

        self.assertEqual(response.status_code, 200, response.text)
        speech = run.call_args.args[1]["items"][0]
        self.assertEqual(speech["instruction"], "")
        for field in ("language", "speech_mode", "rate", "pitch",
                      "volume", "seed", "format"):
            self.assertNotIn(field, speech)

    def test_canonical_validation_preserves_authoring_truth_only(self):
        client = TestClient(app)
        document = {
            "schema": "audio-studio-production-import",
            "version": 1,
            "title": "Evening story",
            "description": "A quiet test.",
            "language": "fr",
            "items": [
                {"type": "speech", "role": "Théa", "text": "Bonsoir.",
                 "speech_mode": "directed", "rate": 1.4},
                {"type": "silence", "seconds": 1.2},
            ],
        }

        response = client.post(
            "/api/v1/production-imports/validate", json={"document": document})

        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()["data"]
        self.assertEqual(data["document"]["title"], "Evening story")
        self.assertEqual(data["document"]["description"], "A quiet test.")
        self.assertEqual(data["summary"]["roles"], [{"name": "Théa", "count": 1}])
        self.assertEqual(data["summary"]["legacy_generation_hints"], 1)
        self.assertNotIn("pitch", data["document"]["items"][0])


if __name__ == "__main__":
    unittest.main()
