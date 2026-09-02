"""Recoverable Creator Draft contract tests."""

import unittest
from uuid import uuid4

import psycopg

from origins.application.creator_drafts import (
    CreatorDraftConflict,
    CreatorDraftService,
    context_key,
)
from origins.http.routers.creator_drafts import (
    CreatorState,
    DraftLookup,
    DraftWrite,
    _state,
)
from origins.config import settings
from origins.infrastructure.postgres.creator_drafts import CreatorDraftRepository


class Store:
    def __init__(self):
        self.rows = {}

    def get(self, _context, key):
        return self.rows.get(key)

    def put(self, context, key, state, expected_version):
        previous = self.rows.get(key)
        current = previous["version"] if previous else 0
        if expected_version is not None and expected_version != current:
            raise CreatorDraftConflict("changed")
        row = {"id": str(uuid4()), "state": state,
               "version": current + 1, "updated_at": "now"}
        self.rows[key] = row
        return row

    def delete(self, key, expected_version):
        previous = self.rows.get(key)
        if not previous:
            return False
        if expected_version is not None and expected_version != previous["version"]:
            raise CreatorDraftConflict("changed")
        del self.rows[key]
        return True


def state():
    return {
        "authored_role": "Narrator",
        "voice_identity_id": "voice-1",
        "route": {"kind": "owned", "binding_id": "binding-1",
                  "catalogue_voice_id": None, "capability_id": None},
        "text": {"raw": "Hello", "shaped": "", "tagged": "",
                 "active": "raw"},
        "text_preparation": {
            "tag_density": "normal", "spoken_profile": "spoken_1",
            "pending_review": None},
        "delivery": {"mode_id": "exact", "instruction": "", "rate": 1,
                     "pitch": 1, "volume": 50, "seed": 0,
                     "enable_ssml": False},
        "output": {"format": "mp3", "language": "English"},
    }


class CreatorDraftTests(unittest.TestCase):
    def test_context_keys_are_stable_and_insertion_specific(self):
        self.assertEqual(context_key({"kind": "standalone"}), "standalone")
        self.assertNotEqual(
            context_key({"kind": "project", "project_id": 4,
                         "insert_before_part_id": str(uuid4())}),
            context_key({"kind": "project", "project_id": 4,
                         "insert_before_part_id": None}))

    def test_contract_rejects_mixed_or_incomplete_routes_and_contexts(self):
        with self.assertRaises(ValueError):
            DraftLookup(context={"kind": "project", "project_id": 4,
                                 "part_id": 7,
                                 "insert_before_part_id": uuid4()})
        broken = state()
        broken["route"] = {"kind": "owned", "binding_id": "binding-1",
                           "catalogue_voice_id": "catalogue-1"}
        with self.assertRaises(ValueError):
            CreatorState(**broken)

    def test_service_round_trip_is_optimistic_and_deletable(self):
        store = Store()
        service = CreatorDraftService(store)
        context = {"kind": "standalone"}
        written = service.put(context, state())
        self.assertEqual(service.get(context), written)
        with self.assertRaises(CreatorDraftConflict):
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

    def test_write_contract_persists_ssml_delivery_choice(self):
        ssml = state()
        ssml["delivery"]["enable_ssml"] = True
        payload = DraftWrite(context={"kind": "standalone"}, state=ssml)
        self.assertTrue(_state(payload)["delivery"]["enable_ssml"])

    def test_write_contract_persists_story_role_and_supported_outputs(self):
        payload = DraftWrite(context={"kind": "standalone"}, state=state())
        self.assertEqual(_state(payload)["authored_role"], "Narrator")
        for output_format in ("mp3", "mp3-24k", "wav", "opus"):
            candidate = state()
            candidate["output"]["format"] = output_format
            self.assertEqual(
                DraftWrite(context={"kind": "standalone"}, state=candidate)
                .state.output.format,
                output_format,
            )

    def test_paid_text_review_persists_only_a_durable_job_pointer(self):
        review_job_id = uuid4()
        pending = state()
        pending["text_preparation"] = {
            "tag_density": "heavy",
            "spoken_profile": "spoken_2",
            "pending_review": {
                "job_id": review_job_id, "kind": "shape",
                "spoken_profile": "spoken_2"},
        }
        payload = DraftWrite(
            context={"kind": "standalone"},
            state=pending)
        serialized = _state(payload)
        prepared = serialized["text_preparation"]
        self.assertEqual(prepared["pending_review"]["job_id"],
                         str(review_job_id))
        self.assertIsInstance(prepared["pending_review"]["job_id"], str)
        self.assertEqual(prepared["spoken_profile"], "spoken_2")
        self.assertEqual(
            prepared["pending_review"]["spoken_profile"], "spoken_2")
        self.assertNotIn("result", prepared["pending_review"])


class CreatorDraftRepositoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            with psycopg.connect(settings.database_url) as database:
                row = database.execute("""
                    INSERT INTO workspaces (name, description)
                    VALUES ('Creator Draft test', 'Disposable fixture')
                    RETURNING id
                """).fetchone()
                cls.workspace_id = int(row[0])
                cls.project_id = int(database.execute("""
                    INSERT INTO projects
                        (workspace_id, project_type, name, description, settings)
                    VALUES (%s, 'audiovisual', 'Draft Project', '', '{}')
                    RETURNING id
                """, (cls.workspace_id,)).fetchone()[0])
                part = database.execute("""
                    INSERT INTO project_parts (project_id, position, title)
                    VALUES (%s, 0, 'Draft Part') RETURNING id, public_id
                """, (cls.project_id,)).fetchone()
                cls.part_id, cls.part_public_id = part
                database.commit()
        except psycopg.OperationalError as exc:
            raise unittest.SkipTest(str(exc)) from exc
    @classmethod
    def tearDownClass(cls):
        if getattr(cls, "workspace_id", None):
            with psycopg.connect(settings.database_url) as database:
                database.execute(
                    "DELETE FROM workspaces WHERE id=%s", (cls.workspace_id,))
                database.commit()

    def setUp(self):
        self.repository = CreatorDraftRepository()
        self.context = {"kind": "standalone"}
        self.key = context_key(self.context)

    def tearDown(self):
        with psycopg.connect(settings.database_url) as database:
            database.execute(
                "DELETE FROM creator_working_drafts WHERE context_key=%s",
                (self.key,))
            database.commit()

    def test_real_round_trip_conflict_and_delete(self):
        first = self.repository.put(self.context, self.key, state(), None)
        self.assertEqual(
            self.repository.get(self.context, self.key)["state"], state())
        with self.assertRaises(CreatorDraftConflict):
            self.repository.put(self.context, self.key, state(), 0)
        second = self.repository.put(
            self.context, self.key, state(), first["version"])
        self.assertEqual(second["version"], first["version"] + 1)
        self.assertTrue(self.repository.delete(self.key, second["version"]))

    def test_project_anchor_and_part_are_validated(self):
        project = {
            "kind": "project", "project_id": self.project_id,
            "operation": "new_part", "part_id": None,
            "insert_before_part_id": str(self.part_public_id),
        }
        key = context_key(project)
        try:
            written = self.repository.put(project, key, state(), None)
            self.assertEqual(written["version"], 1)
            invalid = {**project, "insert_before_part_id": str(uuid4())}
            with self.assertRaisesRegex(ValueError, "insertion point"):
                self.repository.put(invalid, context_key(invalid), state(), None)
        finally:
            with psycopg.connect(settings.database_url) as database:
                database.execute(
                    "DELETE FROM creator_working_drafts WHERE context_key=%s",
                    (key,))
                database.commit()


if __name__ == "__main__":
    unittest.main()
