"""Durable Job metadata regression; the database transaction is rolled back."""

from contextlib import contextmanager
from uuid import uuid4
import unittest

import psycopg

from audio_studio.config import settings
from audio_studio.infrastructure.postgres import jobs as jobs_module


class JobRepositoryTests(unittest.TestCase):
    def test_running_cancel_preserves_completed_cost_but_finishes_cancelled(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        repository = jobs_module.JobRepository()
        job_id = None
        try:
            job, _ = repository.enqueue(
                "fixture_cancel", {},
                idempotency_key=f"cancel-test-{uuid4()}")
            job_id = job.id
            claimed = repository.claim_next(["fixture_cancel"])
            self.assertEqual(claimed.id, job_id)
            repository.cancel(job.public_id)
            self.assertTrue(repository.finish(job_id, {"id": 99}, cost=.25))
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT status, cost, result FROM jobs WHERE id = %s", (job_id,))
                status, cost, result = cursor.fetchone()
            self.assertEqual(status, "cancelled")
            self.assertEqual(float(cost), .25)
            self.assertEqual(result["id"], 99)
        finally:
            if job_id is not None:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM jobs WHERE id = %s", (job_id,))
                connection.commit()
            connection.close()

    def test_lease_prevents_false_loss_and_terminal_state_cannot_be_overwritten(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        repository = jobs_module.JobRepository()
        job_id = None
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO jobs
                        (kind, status, payload, requested_route, created_at,
                         started_at, last_heartbeat_at)
                    VALUES ('fixture_lease', 'running', '{}'::jsonb,
                            '{"executor":"audio-studio-worker-v1"}'::jsonb,
                            now() - interval '2 hours',
                            now() - interval '2 hours', now()) RETURNING id
                """)
                job_id = cursor.fetchone()[0]
            connection.commit()
            repository.abandon_stale(3600)
            with connection.cursor() as cursor:
                cursor.execute("SELECT status FROM jobs WHERE id = %s", (job_id,))
                self.assertEqual(cursor.fetchone()[0], "running")
                cursor.execute("""
                    UPDATE jobs SET last_heartbeat_at = now() - interval '2 hours'
                     WHERE id = %s
                """, (job_id,))
            connection.commit()
            self.assertEqual(repository.abandon_stale(3600), 1)
            self.assertFalse(repository.finish(job_id, {"id": 99}, cost=.25))
            with connection.cursor() as cursor:
                cursor.execute("SELECT status, cost FROM jobs WHERE id = %s", (job_id,))
                self.assertEqual(cursor.fetchone(), ("lost", 0.0))
        finally:
            if job_id is not None:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM jobs WHERE id = %s", (job_id,))
                connection.commit()
            connection.close()

    def test_enqueue_records_identity_route_and_audit_atomically(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        original = jobs_module.transaction

        @contextmanager
        def rolled_back_transaction():
            with connection.cursor() as cursor:
                yield cursor

        jobs_module.transaction = rolled_back_transaction
        try:
            job, created = jobs_module.JobRepository().enqueue(
                "speech", {"text": "test", "voice": "Tina", "engine": "omni", "model": "plus"},
                idempotency_key=f"rollback-test-{uuid4()}", source_tool="speak",
                operation_label="Generate speech",
            )
            self.assertTrue(created)
            with connection.cursor() as cursor:
                cursor.execute("SELECT actor_id, organization_id, source_tool, operation_label, model FROM jobs WHERE id = %s", (job.id,))
                self.assertEqual(cursor.fetchone(), ("local-owner", "local-studio", "speak", "Generate speech", "qwen3.5-omni-plus"))
                cursor.execute("SELECT action FROM audit_records WHERE resource_type = 'job' AND resource_id = %s", (str(job.id),))
                self.assertEqual(cursor.fetchone()[0], "job.enqueued")
                cursor.execute("""
                    INSERT INTO generations
                        (text, voice, model, format, filename, path)
                    VALUES ('fixture', 'Tina', 'plus', 'mp3', '', '')
                    RETURNING id
                """)
                saved_generation_id = cursor.fetchone()[0]
                cursor.execute("""
                    UPDATE jobs SET status = 'running', started_at = now(),
                           last_heartbeat_at = now() WHERE id = %s
                """, (job.id,))
            jobs_module.JobRepository().finish(job.id, {
                "id": saved_generation_id, "cost_basis": "catalog_duration",
                "price_version": "fixture-price", "provider_region": "intl",
                "model": "qwen3-asr-flash-filetrans",
                "engine": "native", "voice": "fixture-voice",
                "estimated_cost": 0.001, "chars": 123,
            }, cost=0.000826)
            with connection.cursor() as cursor:
                cursor.execute("SELECT cost_basis, price_version, provider_region, output_ids, estimated, chars, model, engine, voice, elapsed_ms, generation_id FROM jobs WHERE id = %s", (job.id,))
                (basis, version, region, outputs, estimated, chars, model,
                 engine, voice, elapsed_ms, generation_id) = cursor.fetchone()
                self.assertEqual((basis, version, region), ("catalog_duration", "fixture-price", "intl"))
                self.assertEqual(outputs, [{"type": "part", "id": saved_generation_id}])
                self.assertEqual((float(estimated), chars), (0.001, 123))
                self.assertEqual(
                    (model, engine, voice),
                    ("qwen3-asr-flash-filetrans", "native", "fixture-voice"))
                self.assertIsNotNone(elapsed_ms)
                self.assertEqual(generation_id, saved_generation_id)
                cursor.execute("SELECT action FROM audit_records WHERE resource_id = %s ORDER BY id", (str(job.id),))
                self.assertEqual([row[0] for row in cursor.fetchall()], ["job.enqueued", "job.completed"])
        finally:
            jobs_module.transaction = original
            connection.rollback()
            connection.close()


if __name__ == "__main__":
    unittest.main()
