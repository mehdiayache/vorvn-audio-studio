"""Native control-plane persistence contracts. No provider calls."""

from __future__ import annotations

import unittest
from uuid import uuid4

import psycopg

from origins.composition.operations import system_service
from origins.config import settings
from origins.domain import speech_text
from origins.infrastructure.postgres.activity import ActivityRepository
from origins.infrastructure.postgres.jobs import JobRepository
from origins.infrastructure.postgres.control_plane import (
    ControlPlaneRepository,
)
from origins.infrastructure.postgres.pronunciations import (
    PronunciationRepository,
)


class ControlPlaneRepositoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            raise unittest.SkipTest(str(error)) from error
        connection.close()

    def test_settings_health_and_spend_use_the_native_repository(self):
        repository = ControlPlaneRepository()
        key = f"fixture:{uuid4().hex}"
        try:
            self.assertEqual(repository.setting(key, {"fallback": True}),
                             {"fallback": True})
            self.assertTrue(repository.save_setting(key, {"value": 7}))
            self.assertEqual(repository.setting(key), {"value": 7})
            self.assertTrue(repository.save_setting(key, None))
            self.assertIsNone(repository.setting(key))
            self.assertTrue(repository.database_status()["connected"])
            self.assertTrue(repository.spend_totals().keys() >= {
                "today", "month", "all_time", "runs"})
            health = system_service.health()
            self.assertTrue(health["database"]["connected"])
            self.assertIn(health["status"], {"ok", "degraded"})
            self.assertIn("worker", health)
        finally:
            repository.save_setting(key, None)

    def test_pronunciation_lifecycle_is_used_by_speech_preparation(self):
        repository = PronunciationRepository()
        marker = uuid4().hex[:10]
        pattern = f"Written{marker}"
        entry_id = None
        try:
            entry_id = repository.save({
                "pattern": pattern, "replacement": "spoken fixture",
                "whole_word": True, "match_case": False,
                "enabled": True, "phoneme": False,
            })
            self.assertIsNotNone(entry_id)
            rule = next(item for item in repository.list()
                        if item["id"] == entry_id)
            self.assertEqual(rule["replacement"], "spoken fixture")
            prepared, applied = speech_text.apply_pronunciations(
                f"Please read {pattern} now.",
                repository.list(enabled_only=True),
            )
            self.assertIn("spoken fixture", prepared)
            self.assertEqual(applied[0]["pattern"], pattern)

            updated = repository.save({
                **rule, "replacement": "updated fixture",
            })
            self.assertEqual(updated, entry_id)
            self.assertEqual(
                next(item for item in repository.list(enabled_only=True)
                     if item["id"] == entry_id)["replacement"],
                "updated fixture")

            phoneme_rule = {**rule, "replacement": "model hot fix",
                            "phoneme": True}
            self.assertEqual(repository.save(phoneme_rule), entry_id)
            self.assertIn(
                {pattern: "model hot fix"},
                speech_text.build_hot_fix(
                    repository.list(enabled_only=True)
                )["pronunciation"],
            )
            prepared, applied = speech_text.apply_pronunciations(
                f"Please read {pattern} now.",
                repository.list(enabled_only=True),
            )
            self.assertIn(pattern, prepared)
            self.assertEqual(applied, [])
            self.assertTrue(repository.delete(entry_id))
            entry_id = None
            self.assertFalse(repository.delete(2_147_483_647))
        finally:
            if entry_id is not None:
                repository.delete(entry_id)

    def test_activity_marks_only_the_stale_fixture_and_keeps_audit_fields(self):
        repository = ActivityRepository()
        marker = uuid4().hex
        job_id = None
        try:
            with psycopg.connect(settings.database_url) as database:
                with database.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO jobs
                            (kind, status, detail, cost, cost_basis,
                             source_tool, operation_label, actor_id,
                             organization_id, created_at, result)
                        VALUES ('fixture_control', 'running', %s, 0.125,
                                'actual_tokens', 'settings',
                                'Control plane fixture', 'local-owner',
                                'local-studio', now() - interval '2 hours',
                                '{"provider_diagnostics":[{"path":"1","status":"accepted"}],"request_ids":["req-fixture"]}'::jsonb)
                        RETURNING id
                    """, (marker,))
                    job_id = int(cursor.fetchone()[0])
                database.commit()

            self.assertGreaterEqual(JobRepository().abandon_stale(3600), 1)
            snapshot = repository.snapshot(
                limit=200, kind="fixture_control", failed_only=True)
            self.assertEqual(set(snapshot["today_media"]), {"audio", "video", "other"})
            self.assertEqual(set(snapshot["month_media"]), {"audio", "video", "other"})
            self.assertEqual(set(snapshot["total_media"]), {"audio", "video", "other"})
            run = next(item for item in snapshot["runs_list"]
                       if item["internal_id"] == job_id)
            self.assertEqual((run["status"], run["actor_label"],
                              run["operation"], run["cost_basis"]),
                             ("lost", "You", "Control plane fixture",
                              "actual_usage"))
            self.assertEqual(run["provider_request_ids"], ["req-fixture"])
            self.assertEqual(run["provider_diagnostics"][0]["status"],
                             "accepted")
            self.assertTrue(snapshot["cost_breakdown"])
        finally:
            if job_id is not None:
                with psycopg.connect(settings.database_url) as database:
                    with database.cursor() as cursor:
                        cursor.execute("DELETE FROM jobs WHERE id = %s", (job_id,))
                    database.commit()


if __name__ == "__main__":
    unittest.main()
