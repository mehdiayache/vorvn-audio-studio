"""Durable Job metadata regression; the database transaction is rolled back."""

from contextlib import contextmanager
import hashlib
from uuid import uuid4
import unittest

import psycopg

from audio_studio.config import settings
from audio_studio.infrastructure.postgres import jobs as jobs_module
from audio_studio.infrastructure.postgres import production_speech as production_speech_module
from audio_studio.infrastructure.postgres.production_speech import (
    ProductionSpeechCommandRepository,
)
from audio_studio.domain.jobs import IdempotencyConflict


class JobRepositoryTests(unittest.TestCase):
    def test_production_speech_creates_one_part_before_provider_and_reuses_it_on_retry(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        original = production_speech_module.transaction

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT id FROM productions
                 WHERE archived_at IS NULL ORDER BY id LIMIT 1
            """)
            owner = cursor.fetchone()
            if not owner:
                connection.close()
                self.skipTest("No Production fixture is available")
            production_id = int(owner[0])
            cursor.execute("""
                SELECT coalesce(max(position), -1) + 1
                  FROM production_parts
                 WHERE production_id=%s AND archived_at IS NULL
            """, (production_id,))
            anchor_position = int(cursor.fetchone()[0])
            cursor.execute("""
                INSERT INTO production_parts
                    (production_id, position, kind, script,
                     editorial_status, revision)
                VALUES (%s, %s, 'silence', '', 'ready', 1)
                RETURNING id, public_id
            """, (production_id, anchor_position))
            anchor_id, anchor_public_id = cursor.fetchone()

            @contextmanager
            def rolled_back_transaction():
                yield cursor

            production_speech_module.transaction = rolled_back_transaction
            try:
                request = {
                    "operation": "create",
                    "text": "Prepared provider text",
                    "text_raw": "Canonical Part script",
                    "voice": "Tina",
                    "catalogue_voice_id":
                        "alibaba:intl:qwen3.5-omni-plus:Tina",
                    "engine": "omni",
                    "model": "plus",
                    "format": "mp3",
                    "language": "English",
                }
                key = f"production-speech-{uuid4()}"
                repository = ProductionSpeechCommandRepository(
                    jobs_module.JobRepository())
                job, created = repository.enqueue(
                    request, idempotency_key=key,
                    production_id=production_id,
                    before_part_public_id=anchor_public_id)
                self.assertTrue(created)
                self.assertIsNotNone(job.part_id)
                cursor.execute("""
                    SELECT position, kind, script, editorial_status, revision,
                           selected_take_id
                      FROM production_parts WHERE id=%s
                """, (job.part_id,))
                self.assertEqual(cursor.fetchone(), (
                    anchor_position, "speech", "Canonical Part script",
                    "draft", 1, None))
                cursor.execute(
                    "SELECT position FROM production_parts WHERE id=%s",
                    (anchor_id,))
                self.assertEqual(cursor.fetchone()[0], anchor_position + 1)
                self.assertEqual(job.payload["operation"], "record_part")
                self.assertEqual(job.payload["part_id"], job.part_id)
                self.assertEqual(job.payload["_source_part_revision"], 1)
                self.assertEqual(
                    job.payload["_source_script_hash"],
                    hashlib.sha256(b"Canonical Part script").hexdigest())

                repeated, repeated_created = (
                    repository.enqueue(
                        request, idempotency_key=key,
                        production_id=production_id,
                        before_part_public_id=anchor_public_id))
                self.assertFalse(repeated_created)
                self.assertEqual(repeated.id, job.id)
                self.assertEqual(repeated.part_id, job.part_id)

                retry, retry_created = (
                    repository.enqueue(
                        {**request, "operation": "record_part",
                         "part_id": job.part_id},
                        idempotency_key=f"production-speech-retry-{uuid4()}",
                        production_id=production_id))
                self.assertTrue(retry_created)
                self.assertNotEqual(retry.id, job.id)
                self.assertEqual(retry.part_id, job.part_id)
                alternative_text = "Alternative words"
                alternative, alternative_created = repository.enqueue(
                    {**request, "operation": "record_part",
                     "part_id": job.part_id, "text_raw": alternative_text,
                     "select_result": False},
                    idempotency_key=f"production-speech-alternative-{uuid4()}",
                    production_id=production_id)
                self.assertTrue(alternative_created)
                self.assertEqual(
                    alternative.payload["_source_script_hash"],
                    hashlib.sha256(alternative_text.encode()).hexdigest())
                with self.assertRaisesRegex(
                        ValueError, "Update the Part explicitly"):
                    repository.enqueue(
                        {**request, "operation": "record_part",
                         "part_id": job.part_id,
                         "text_raw": alternative_text,
                         "select_result": True},
                        idempotency_key=f"production-speech-invalid-{uuid4()}",
                        production_id=production_id)
                cursor.execute("""
                    SELECT count(*) FROM production_parts
                     WHERE production_id=%s AND script='Canonical Part script'
                """, (production_id,))
                self.assertEqual(cursor.fetchone()[0], 1)
            finally:
                production_speech_module.transaction = original
                connection.rollback()
                connection.close()

    def test_idempotency_is_scoped_and_rejects_payload_reuse(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        repository = jobs_module.JobRepository()
        key = f"idempotency-{uuid4()}"
        ids = []
        try:
            first, created = repository.enqueue(
                "fixture_idempotency", {"value": 1}, idempotency_key=key,
                organization_id="organization-a")
            ids.append(first.id)
            repeated, created_again = repository.enqueue(
                "fixture_idempotency", {"value": 1}, idempotency_key=key,
                organization_id="organization-a")
            self.assertTrue(created)
            self.assertFalse(created_again)
            self.assertEqual(repeated.id, first.id)
            with self.assertRaises(IdempotencyConflict):
                repository.enqueue(
                    "fixture_idempotency", {"value": 2}, idempotency_key=key,
                    organization_id="organization-a")
            second_org, second_created = repository.enqueue(
                "fixture_idempotency", {"value": 2}, idempotency_key=key,
                organization_id="organization-b")
            ids.append(second_org.id)
            self.assertTrue(second_created)
        finally:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM jobs WHERE id = ANY(%s)", (ids,))
            connection.commit()
            connection.close()

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
                    UPDATE jobs SET status = 'running', started_at = now(),
                           last_heartbeat_at = now() WHERE id = %s
                """, (job.id,))
            jobs_module.JobRepository().finish(job.id, {
                "cost_basis": "catalog_duration",
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
                self.assertEqual(outputs, [])
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
