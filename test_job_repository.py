"""Durable Job metadata regression; the database transaction is rolled back."""

from contextlib import contextmanager
from uuid import uuid4
import unittest

import psycopg

from audio_studio.config import settings
from audio_studio.infrastructure.postgres import jobs as jobs_module


class JobRepositoryTests(unittest.TestCase):
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
            jobs_module.JobRepository().finish(job.id, {
                "id": 42, "cost_basis": "catalog_duration",
                "price_version": "fixture-price", "provider_region": "intl",
                "model": "qwen3-asr-flash-filetrans",
                "engine": "native", "voice": "fixture-voice",
                "estimated_cost": 0.001, "chars": 123,
            }, cost=0.000826)
            with connection.cursor() as cursor:
                cursor.execute("SELECT cost_basis, price_version, provider_region, output_ids, estimated, chars, model, engine, voice, elapsed_ms FROM jobs WHERE id = %s", (job.id,))
                (basis, version, region, outputs, estimated, chars, model,
                 engine, voice, elapsed_ms) = cursor.fetchone()
                self.assertEqual((basis, version, region), ("catalog_duration", "fixture-price", "intl"))
                self.assertEqual(outputs, [{"type": "part", "id": 42}])
                self.assertEqual((float(estimated), chars), (0.001, 123))
                self.assertEqual(
                    (model, engine, voice),
                    ("qwen3-asr-flash-filetrans", "native", "fixture-voice"))
                self.assertIsNotNone(elapsed_ms)
                cursor.execute("SELECT action FROM audit_records WHERE resource_id = %s ORDER BY id", (str(job.id),))
                self.assertEqual([row[0] for row in cursor.fetchall()], ["job.enqueued", "job.completed"])
        finally:
            jobs_module.transaction = original
            connection.rollback()
            connection.close()


if __name__ == "__main__":
    unittest.main()
