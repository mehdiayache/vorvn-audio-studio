"""Recoverable Composer Draft contract tests."""

import unittest
from uuid import uuid4

import psycopg

from audio_studio.application.composer_drafts import (
    ComposerDraftConflict,
    ComposerDraftService,
    context_key,
)
from audio_studio.http.routers.composer_drafts import (
    ComposerState,
    DraftLookup,
    DraftWrite,
    _state,
)
from audio_studio.config import settings
from audio_studio.infrastructure.postgres.composer_drafts import ComposerDraftRepository


class Store:
    def __init__(self):
        self.rows = {}

    def get(self, _context, key):
        return self.rows.get(key)

    def put(self, context, key, state, expected_version):
        previous = self.rows.get(key)
        current = previous["version"] if previous else 0
        if expected_version is not None and expected_version != current:
            raise ComposerDraftConflict("changed")
        row = {"id": str(uuid4()), "state": state,
               "version": current + 1, "updated_at": "now"}
        self.rows[key] = row
        return row

    def delete(self, key, expected_version):
        previous = self.rows.get(key)
        if not previous:
            return False
        if expected_version is not None and expected_version != previous["version"]:
            raise ComposerDraftConflict("changed")
        del self.rows[key]
        return True


def state():
    return {
        "voice_identity_id": "voice-1",
        "route": {"kind": "owned", "binding_id": "binding-1",
                  "catalogue_voice_id": None, "capability_id": None},
        "text": {"raw": "Hello", "shaped": "", "tagged": "",
                 "active": "raw"},
        "text_preparation": {
            "tag_density": "normal", "pending_review": None},
        "delivery": {"mode_id": "exact", "instruction": "", "rate": 1,
                     "pitch": 1, "volume": 50, "seed": 0},
        "output": {"format": "mp3", "language": "English"},
    }


class ComposerDraftTests(unittest.TestCase):
    def test_context_keys_are_stable_and_insertion_specific(self):
        self.assertEqual(context_key({"kind": "standalone"}), "standalone")
        self.assertNotEqual(
            context_key({"kind": "production", "production_id": 4,
                         "operation": "new_part",
                         "insert_before_part_id": str(uuid4())}),
            context_key({"kind": "production", "production_id": 4,
                         "operation": "new_part",
                         "insert_before_part_id": None}))

    def test_contract_rejects_mixed_or_incomplete_routes_and_contexts(self):
        with self.assertRaises(ValueError):
            DraftLookup(context={"kind": "production", "production_id": 4,
                                 "operation": "new_take"})
        broken = state()
        broken["route"] = {"kind": "owned", "binding_id": "binding-1",
                           "catalogue_voice_id": "catalogue-1"}
        with self.assertRaises(ValueError):
            ComposerState(**broken)

    def test_service_round_trip_is_optimistic_and_deletable(self):
        store = Store()
        service = ComposerDraftService(store)
        context = {"kind": "standalone"}
        written = service.put(context, state())
        self.assertEqual(service.get(context), written)
        with self.assertRaises(ComposerDraftConflict):
            service.put(context, state(), expected_version=0)
        updated = service.put(context, state(), expected_version=1)
        self.assertEqual(updated["version"], 2)
        self.assertEqual(service.delete(context, 2), {"deleted": True})

    def test_write_contract_contains_only_recoverable_state(self):
        payload = DraftWrite(
            context={"kind": "standalone"},
            state=state())
        dumped = payload.model_dump()
        self.assertNotIn("editorial_patch", dumped["state"])
        self.assertNotIn("job", dumped["state"])
        self.assertNotIn("ui", dumped["state"])

    def test_paid_text_review_persists_only_a_durable_job_pointer(self):
        review_job_id = uuid4()
        pending = state()
        pending["text_preparation"] = {
            "tag_density": "heavy",
            "pending_review": {
                "job_id": review_job_id, "kind": "tag"},
        }
        payload = DraftWrite(
            context={"kind": "standalone"},
            state=pending)
        serialized = _state(payload)
        prepared = serialized["text_preparation"]
        self.assertEqual(prepared["pending_review"]["job_id"],
                         str(review_job_id))
        self.assertIsInstance(prepared["pending_review"]["job_id"], str)
        self.assertNotIn("result", prepared["pending_review"])


class ComposerDraftRepositoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            with psycopg.connect(settings.database_url) as database:
                row = database.execute("""
                    SELECT production.id, part.id, part.public_id
                      FROM productions production
                      JOIN production_parts part
                        ON part.production_id = production.id
                     WHERE production.archived_at IS NULL
                       AND part.archived_at IS NULL
                     ORDER BY production.id, part.position LIMIT 1
                """).fetchone()
        except psycopg.OperationalError as exc:
            raise unittest.SkipTest(str(exc)) from exc
        if not row:
            raise unittest.SkipTest("No Production Part fixture is available")
        cls.production_id, cls.part_id, cls.part_public_id = row

    def setUp(self):
        self.repository = ComposerDraftRepository()
        self.context = {"kind": "standalone"}
        self.key = context_key(self.context)

    def tearDown(self):
        with psycopg.connect(settings.database_url) as database:
            database.execute(
                "DELETE FROM composer_working_drafts WHERE context_key=%s",
                (self.key,))
            database.commit()

    def test_real_round_trip_conflict_and_delete(self):
        first = self.repository.put(self.context, self.key, state(), None)
        self.assertEqual(
            self.repository.get(self.context, self.key)["state"], state())
        with self.assertRaises(ComposerDraftConflict):
            self.repository.put(self.context, self.key, state(), 0)
        second = self.repository.put(
            self.context, self.key, state(), first["version"])
        self.assertEqual(second["version"], first["version"] + 1)
        self.assertTrue(self.repository.delete(self.key, second["version"]))

    def test_production_anchor_and_part_are_validated(self):
        production = {
            "kind": "production", "production_id": self.production_id,
            "operation": "new_part", "part_id": None,
            "insert_before_part_id": str(self.part_public_id),
        }
        key = context_key(production)
        try:
            written = self.repository.put(production, key, state(), None)
            self.assertEqual(written["version"], 1)
            invalid = {**production, "insert_before_part_id": str(uuid4())}
            with self.assertRaisesRegex(ValueError, "insertion point"):
                self.repository.put(invalid, context_key(invalid), state(), None)
        finally:
            with psycopg.connect(settings.database_url) as database:
                database.execute(
                    "DELETE FROM composer_working_drafts WHERE context_key=%s",
                    (key,))
                database.commit()


if __name__ == "__main__":
    unittest.main()
