"""Spend Guard and ProviderAttempt invariants; no provider calls."""

import unittest
from uuid import uuid4

import psycopg
from fastapi.testclient import TestClient

from audio_studio.application.provider_operations import ProviderOperationService
from audio_studio.config import settings
from audio_studio.infrastructure.postgres.jobs import JobRepository
from audio_studio.infrastructure.postgres.provider_operations import (
    ProviderOperationRepository,
)
from audio_studio.infrastructure.postgres.activity import ActivityRepository
from audio_studio.infrastructure.postgres.spend import today_provider_spend
from audio_studio.http.app import app


class ProviderOperationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            raise unittest.SkipTest(str(error)) from error
        connection.close()

    def setUp(self):
        self.jobs = JobRepository()
        self.records = ProviderOperationRepository()
        self.service = ProviderOperationService(self.records)
        self.job_ids: list[int] = []

    def tearDown(self):
        if not self.job_ids:
            return
        with psycopg.connect(settings.database_url) as database:
            database.execute("DELETE FROM jobs WHERE id=ANY(%s)",
                             (self.job_ids,))
            database.commit()

    def job(self) -> int:
        job, _ = self.jobs.enqueue(
            "speech", {"text": "same paid request"},
            idempotency_key=f"attempt-test-{uuid4()}",
            source_tool="test", operation_label="Provider attempt test")
        self.job_ids.append(job.id)
        return job.id

    def test_ambiguous_attempt_persists_without_clip_and_links_human_retry(self):
        first_job = self.job()
        reservation = self.service.authorize(
            first_job, "speech", .0123,
            {"daily_cap": 0, "warn_above": 0}, True)
        payload = {"text_hash": "same", "language": "English"}
        first = self.records.begin_attempt(
            first_job, "speech",
            {"provider": "alibaba", "region": "intl", "model": "fixture"},
            payload, reservation)
        self.records.mark_sent(first)
        self.records.finish_attempt(
            first, "ambiguous", cost=.0123, usage={}, request_ids=[],
            error={"message": "response lost"})

        second_job = self.job()
        second_reservation = self.service.authorize(
            second_job, "speech", .0123,
            {"daily_cap": 0, "warn_above": 0}, True)
        second = self.records.begin_attempt(
            second_job, "speech",
            {"provider": "alibaba", "region": "intl", "model": "fixture"},
            payload, second_reservation)

        with psycopg.connect(settings.database_url) as database:
            first_row = database.execute("""
                SELECT status, cost FROM provider_attempts WHERE id=%s
            """, (int(first),)).fetchone()
            second_row = database.execute("""
                SELECT status, previous_attempt_id FROM provider_attempts WHERE id=%s
            """, (int(second),)).fetchone()
            reservation_row = database.execute("""
                SELECT status, actual_cost FROM budget_reservations WHERE id=%s
            """, (int(reservation),)).fetchone()
            clip_count = database.execute(
                "SELECT count(*) FROM clips WHERE provider_attempt_id=%s",
                (int(first),)).fetchone()[0]
        self.assertEqual(first_row[0], "ambiguous")
        self.assertAlmostEqual(float(first_row[1]), .0123)
        self.assertEqual(second_row, ("not_sent", int(first)))
        self.assertEqual(reservation_row[0], "ambiguous")
        self.assertAlmostEqual(float(reservation_row[1]), .0123)
        self.assertEqual(clip_count, 0)

    def test_lost_sent_attempt_becomes_ambiguous_with_budget_evidence(self):
        job_id = self.job()
        reservation = self.service.authorize(
            job_id, "speech", .02,
            {"daily_cap": 0, "warn_above": 0}, True)
        attempt = self.records.begin_attempt(
            job_id, "speech",
            {"provider": "alibaba", "region": "intl", "model": "fixture"},
            {"text_hash": "lost"}, reservation)
        self.records.mark_sent(attempt)
        with psycopg.connect(settings.database_url) as database:
            database.execute("""
                UPDATE jobs SET status='running', started_at=now()-interval '1 hour',
                       last_heartbeat_at=now()-interval '1 hour'
                 WHERE id=%s
            """, (job_id,))
            database.commit()
        self.assertGreaterEqual(self.jobs.abandon_stale(30), 1)
        with psycopg.connect(settings.database_url) as database:
            attempt_row = database.execute(
                "SELECT status,cost FROM provider_attempts WHERE id=%s",
                (int(attempt),)).fetchone()
            budget_row = database.execute(
                "SELECT status,actual_cost FROM budget_reservations WHERE id=%s",
                (int(reservation),)).fetchone()
            job_status = database.execute(
                "SELECT status,result FROM jobs WHERE id=%s",
                (job_id,)).fetchone()
        self.assertEqual(attempt_row[0], "ambiguous")
        self.assertAlmostEqual(float(attempt_row[1]), .02)
        self.assertEqual(budget_row[0], "ambiguous")
        self.assertAlmostEqual(float(budget_row[1]), .02)
        self.assertEqual(job_status[0], "blocked")
        self.assertTrue(job_status[1]["requires_review"])

    def test_failure_classification_is_conservative_after_send(self):
        self.assertEqual(self.service.failure_status(
            ValueError("invalid request")), "definitive_failed")
        self.assertEqual(self.service.failure_status(
            TimeoutError("socket closed")), "ambiguous")

    def test_catalogue_and_configuration_reads_create_no_business_attempt(self):
        with psycopg.connect(settings.database_url) as database:
            before = database.execute(
                "SELECT count(*) FROM provider_attempts").fetchone()[0]
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/v1/voice-registry").status_code, 200)
            self.assertEqual(client.get("/api/v1/config").status_code, 200)
        with psycopg.connect(settings.database_url) as database:
            after = database.execute(
                "SELECT count(*) FROM provider_attempts").fetchone()[0]
        self.assertEqual(after, before)

    def test_active_multi_attempt_reservation_keeps_its_full_budget(self):
        """A cheap first attempt must not release a live operation's remainder."""
        cap = today_provider_spend() + 10
        first_job = self.job()
        reservation = self.service.authorize(
            first_job, "multi_attempt_speech", 8,
            {"daily_cap": cap, "warn_above": 0}, True)
        attempt = self.records.begin_attempt(
            first_job, "speech",
            {"provider": "alibaba", "region": "intl", "model": "fixture"},
            {"row": 2}, reservation)
        self.records.mark_sent(attempt)
        self.records.finish_attempt(
            attempt, "succeeded", cost=1, usage={}, request_ids=[], error={},
            reconcile_budget=False)

        second_job = self.job()
        with self.assertRaisesRegex(PermissionError, "Daily cap"):
            self.service.authorize(
                second_job, "speech", 8,
                {"daily_cap": cap, "warn_above": 0}, True)

    def test_child_attempt_keeps_estimate_while_full_budget_stays_protected(self):
        baseline = today_provider_spend()
        job_id = self.job()
        reservation = self.service.authorize(
            job_id, "multi_attempt_speech", 8,
            {"daily_cap": baseline + 10, "warn_above": 0}, True)
        attempt = self.records.begin_attempt(
            job_id, "speech",
            {"provider": "alibaba", "region": "intl", "model": "fixture"},
            {"row": 2}, reservation, estimated_cost=.8)
        self.records.mark_sent(attempt)
        self.records.finish_attempt(
            attempt, "ambiguous", cost=.8, usage={}, request_ids=[], error={})

        with psycopg.connect(settings.database_url) as database:
            attempt_estimate = database.execute(
                "SELECT estimated_cost FROM provider_attempts WHERE id=%s",
                (int(attempt),)).fetchone()[0]
            reservation_row = database.execute("""
                SELECT estimated_cost,actual_cost,status
                  FROM budget_reservations WHERE id=%s
            """, (int(reservation),)).fetchone()
        self.assertAlmostEqual(float(attempt_estimate), .8)
        self.assertAlmostEqual(float(reservation_row[0]), 8)
        self.assertAlmostEqual(float(reservation_row[1]), .8)
        self.assertEqual(reservation_row[2], "ambiguous")

        other_job = self.job()
        with self.assertRaisesRegex(PermissionError, "Daily cap"):
            self.service.authorize(
                other_job, "speech", 3,
                {"daily_cap": baseline + 10, "warn_above": 0}, True)

    def test_provider_receipt_and_local_artifact_are_separate_evidence(self):
        job_id = self.job()
        reservation = self.service.authorize(
            job_id, "speech", .02,
            {"daily_cap": 0, "warn_above": 0}, True)
        attempt = self.records.begin_attempt(
            job_id, "speech",
            {"provider": "alibaba", "region": "intl", "model": "fixture"},
            {"text_hash": "fixture"}, reservation)
        self.records.mark_sent(attempt)
        self.records.finish_attempt(
            attempt, "succeeded", cost=.012, usage={"audio": 4},
            request_ids=["provider-request"], error={},
            receipt={"audio_sha256": "abc", "size_bytes": 3})
        self.records.record_artifact(
            attempt, {"type": "audio", "filename": "opaque.mp3"})
        with psycopg.connect(settings.database_url) as database:
            status, diagnostics = database.execute(
                "SELECT status,diagnostics FROM provider_attempts WHERE id=%s",
                (int(attempt),)).fetchone()
        self.assertEqual(status, "succeeded")
        self.assertEqual(diagnostics["provider_result"]["audio_sha256"], "abc")
        self.assertEqual(diagnostics["local_artifact"]["filename"], "opaque.mp3")
        run = next(item for item in ActivityRepository().snapshot()["runs_list"]
                   if item["internal_id"] == job_id)
        self.assertAlmostEqual(run["cost"], .012)


if __name__ == "__main__":
    unittest.main()
