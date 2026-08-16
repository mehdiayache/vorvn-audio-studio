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
            self.assertEqual(draft["text_raw"], source["text"])
            self.assertIsNone(draft["text_shaped"])
            self.assertIsNone(draft["text_tagged"])
            self.assertEqual(draft["text_state"], "raw")
            self.assertEqual(
                draft["voice_identity_id"], self.identity_ids[source["role"]])
            self.assertEqual(draft["language"], source["language"])
            self.assertEqual(draft["speech_mode"], source["speech_mode"])
            self.assertEqual(draft["instruction"], source["instruction"])
            self.assertEqual(draft["rate"], source["rate"])
            self.assertEqual(draft["pitch"], source["pitch"])
            self.assertEqual(draft["volume"], source["volume"])
            self.assertEqual(draft["seed"], source["seed"])
            self.assertEqual(draft["format"], source["format"])
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
                    "SELECT state ? 'role' FROM composition_drafts "
                    "WHERE production_id=%s",
                    (self.production["id"],),
                )
                self.assertTrue(all(not row[0] for row in cursor.fetchall()))

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


if __name__ == "__main__":
    unittest.main()
