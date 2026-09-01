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
    def test_space_creation_job_round_trips_canonical_creation_metadata(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        repository = jobs_module.JobRepository()
        job_id = None
        file_id = None
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id FROM spaces ORDER BY id LIMIT 1")
                owner = cursor.fetchone()
            if not owner:
                self.skipTest("No Space fixture is available")
            space_id = int(owner[0])
            created, _ = repository.enqueue(
                "audio_generate", {"capability": "music"},
                idempotency_key=f"space-creation-{uuid4()}",
                space_id=space_id,
                creation_action_id="generate-music",
                creation_context={"space_id": space_id},
                source_tool="create",
                operation_label="Generate music")
            job_id = created.id

            loaded = repository.get(created.public_id)
            recent = repository.recent_for_space(
                space_id, kind="audio_generate", limit=1)
            with connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO assets (space_id, name, kind, media_type, source)
                    VALUES (%s, 'Space Job output', 'audio', 'audio', 'generated')
                    RETURNING id
                """, (space_id,))
                file_id = int(cursor.fetchone()[0])
            connection.commit()
            self.assertTrue(repository.attach_output_file(
                created.public_id, file_id))
            self.assertTrue(repository.attach_output_file(
                created.public_id, file_id))
            linked = repository.get(created.public_id)

            self.assertIsNotNone(loaded)
            self.assertEqual(loaded.space_id, space_id)
            self.assertEqual(loaded.creation_action_id, "generate-music")
            self.assertEqual(loaded.creation_context, {"space_id": space_id})
            self.assertEqual(loaded.output_file_ids, ())
            self.assertEqual(recent[0].id, created.id)
            self.assertEqual(linked.output_file_ids, (file_id,))
        finally:
            if job_id:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM jobs WHERE id=%s", (job_id,))
                    if file_id:
                        cursor.execute("DELETE FROM assets WHERE id=%s", (file_id,))
                connection.commit()
            connection.close()

    def test_recent_generation_jobs_are_scoped_and_newest_first(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        repository = jobs_module.JobRepository()
        job_ids = []
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id FROM productions WHERE archived_at IS NULL "
                    "ORDER BY id LIMIT 1")
                owner = cursor.fetchone()
            if not owner:
                self.skipTest("No Production fixture is available")
            production_id = int(owner[0])
            first, _ = repository.enqueue(
                "audio_generate", {"prompt": "first"},
                idempotency_key=f"generation-recent-{uuid4()}",
                production_id=production_id)
            second, _ = repository.enqueue(
                "audio_generate", {"prompt": "second"},
                idempotency_key=f"generation-recent-{uuid4()}",
                production_id=production_id)
            job_ids.extend([first.id, second.id])

            recent = repository.recent_for_production(
                production_id, kind="audio_generate", limit=2)

            self.assertEqual([job.id for job in recent],
                             [second.id, first.id])
        finally:
            if job_ids:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM jobs WHERE id=ANY(%s)",
                                   (job_ids,))
                connection.commit()
            connection.close()

    def test_latest_render_job_recovers_export_progress_for_a_production(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        repository = jobs_module.JobRepository()
        job_ids = []
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id FROM productions WHERE archived_at IS NULL "
                    "ORDER BY id LIMIT 1")
                owner = cursor.fetchone()
            if not owner:
                self.skipTest("No Production fixture is available")
            production_id = int(owner[0])
            preview, _ = repository.enqueue(
                "render", {"production_id": production_id,
                           "operation": "preview"},
                idempotency_key=f"preview-recovery-{uuid4()}",
                production_id=production_id)
            export, _ = repository.enqueue(
                "render", {"production_id": production_id,
                           "operation": "export"},
                idempotency_key=f"export-recovery-{uuid4()}",
                production_id=production_id)
            job_ids.extend([preview.id, export.id])

            recovered = repository.latest_for_production(
                production_id, kind="render", operation="export")
            self.assertIsNotNone(recovered)
            self.assertEqual(recovered.id, export.id)
            self.assertNotEqual(recovered.id, preview.id)
        finally:
            if job_ids:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM jobs WHERE id=ANY(%s)",
                                   (job_ids,))
                connection.commit()
            connection.close()

    def test_production_speech_creates_one_part_before_provider_and_reuses_it_on_retry(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        original = production_speech_module.transaction
        original_jobs_transaction = jobs_module.transaction

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
            cursor.execute("""
                INSERT INTO production_parts
                    (production_id, position, kind, script,
                     editorial_status, revision, archived_at)
                VALUES (%s, %s, 'speech', 'Archived by an older runtime',
                        'ready', 1, now())
                RETURNING id
            """, (production_id, anchor_position + 1))
            stale_archived_id = int(cursor.fetchone()[0])

            @contextmanager
            def rolled_back_transaction():
                yield cursor

            production_speech_module.transaction = rolled_back_transaction
            jobs_module.transaction = rolled_back_transaction
            try:
                request = {
                    "text": "Prepared provider text",
                    "text_raw": "Canonical Part script",
                    "authored_role": "Night Guide",
                    "voice": "Cherry",
                    "catalogue_voice_id":
                        "alibaba:intl:qwen-audio-3.0-tts-plus:Cherry",
                    "engine": "audio",
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
                           authored_role,
                           (SELECT clip.id FROM clips clip
                             WHERE clip.part_id = production_parts.id)
                      FROM production_parts WHERE id=%s
                """, (job.part_id,))
                self.assertEqual(cursor.fetchone(), (
                    anchor_position, "speech", "Canonical Part script",
                    "draft", 1, "Night Guide", None))
                cursor.execute(
                    "SELECT position FROM production_parts WHERE id=%s",
                    (anchor_id,))
                self.assertEqual(cursor.fetchone()[0], anchor_position + 1)
                cursor.execute("""
                    SELECT position, archived_position
                      FROM production_parts WHERE id=%s
                """, (stale_archived_id,))
                self.assertEqual(cursor.fetchone(), (
                    None, anchor_position + 1))
                self.assertEqual(job.payload["operation"], "record")
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

                cursor.execute("""
                    UPDATE jobs SET status='blocked',
                           result='{"needs_confirmation":true,"estimate":0.04}'::jsonb
                     WHERE id=%s
                """, (job.id,))
                confirmed, confirmed_created = repository.jobs.confirm(
                    job.public_id,
                    idempotency_key=f"production-confirm-{uuid4()}")
                self.assertTrue(confirmed_created)
                self.assertEqual(confirmed.part_id, job.part_id)
                self.assertEqual(confirmed.payload["operation"], "record")
                self.assertTrue(confirmed.payload["confirmed"])
                cursor.execute("""
                    SELECT parent_id, part_id FROM jobs WHERE id=%s
                """, (confirmed.id,))
                self.assertEqual(cursor.fetchone(), (job.id, job.part_id))
                cursor.execute("""
                    SELECT count(*) FROM production_parts
                     WHERE production_id=%s AND script='Canonical Part script'
                """, (production_id,))
                self.assertEqual(cursor.fetchone()[0], 1)

                retry, retry_created = (
                    repository.enqueue(
                        {**request, "part_id": job.part_id},
                        idempotency_key=f"production-speech-retry-{uuid4()}",
                        production_id=production_id))
                self.assertTrue(retry_created)
                self.assertNotEqual(retry.id, job.id)
                self.assertEqual(retry.part_id, job.part_id)
                changed_text = "Changed words"
                with self.assertRaisesRegex(
                        ValueError, "Update the Part explicitly"):
                    repository.enqueue(
                        {**request, "part_id": job.part_id,
                         "text_raw": changed_text},
                        idempotency_key=f"production-speech-invalid-{uuid4()}",
                        production_id=production_id)
                cursor.execute("""
                    SELECT count(*) FROM production_parts
                     WHERE production_id=%s AND script='Canonical Part script'
                """, (production_id,))
                self.assertEqual(cursor.fetchone()[0], 1)
            finally:
                production_speech_module.transaction = original
                jobs_module.transaction = original_jobs_transaction
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

    def test_paid_failure_evidence_requires_review_and_cannot_retry_automatically(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        repository = jobs_module.JobRepository()
        job_ids = []
        try:
            ambiguous, _ = repository.enqueue(
                "fixture_review", {},
                idempotency_key=f"review-test-{uuid4()}")
            job_ids.append(ambiguous.id)
            self.assertEqual(repository.claim_next(["fixture_review"]).id,
                             ambiguous.id)
            repository.fail(
                ambiguous.id, "response lost", retry=True,
                result={"ambiguous": True, "requires_review": True,
                        "cost": .02})

            definitive, _ = repository.enqueue(
                "fixture_failure", {},
                idempotency_key=f"failure-test-{uuid4()}")
            job_ids.append(definitive.id)
            self.assertEqual(repository.claim_next(["fixture_failure"]).id,
                             definitive.id)
            repository.fail(definitive.id, "invalid request", result={})

            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT status, cost, result FROM jobs WHERE id=%s",
                    (ambiguous.id,))
                status, cost, result = cursor.fetchone()
                self.assertEqual(status, "blocked")
                self.assertAlmostEqual(float(cost), .02)
                self.assertTrue(result["requires_review"])
                cursor.execute(
                    "SELECT status FROM jobs WHERE id=%s", (definitive.id,))
                self.assertEqual(cursor.fetchone()[0], "failed")
        finally:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM jobs WHERE id=ANY(%s)", (job_ids,))
            connection.commit()
            connection.close()

    def test_cost_confirmation_creates_one_linked_job_without_provider_attempt(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        repository = jobs_module.JobRepository()
        job_ids = []
        try:
            blocked, _ = repository.enqueue(
                "fixture_confirm", {"confirmed": False, "value": 7},
                idempotency_key=f"confirm-source-{uuid4()}",
                source_tool="speak", operation_label="Paid fixture")
            job_ids.append(blocked.id)
            self.assertEqual(repository.claim_next(["fixture_confirm"]).id,
                             blocked.id)
            self.assertTrue(repository.finish(
                blocked.id,
                {"needs_confirmation": True, "estimate": .04},
                status="blocked"))

            confirmation_key = f"confirm-child-{uuid4()}"
            confirmed, created = repository.confirm(
                blocked.public_id, idempotency_key=confirmation_key)
            job_ids.append(confirmed.id)
            self.assertTrue(created)
            self.assertTrue(confirmed.payload["confirmed"])
            repeated, repeated_created = repository.confirm(
                blocked.public_id, idempotency_key=confirmation_key)
            self.assertFalse(repeated_created)
            self.assertEqual(repeated.id, confirmed.id)
            second_click, second_click_created = repository.confirm(
                blocked.public_id,
                idempotency_key=f"different-browser-click-{uuid4()}")
            self.assertFalse(second_click_created)
            self.assertEqual(second_click.id, confirmed.id)

            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT parent_id, provider_attempt_id, source_tool,
                           operation_label FROM jobs WHERE id=%s
                """, (confirmed.id,))
                self.assertEqual(cursor.fetchone(), (
                    blocked.id, None, "speak", "Paid fixture"))
                cursor.execute("""
                    SELECT kind FROM job_events WHERE job_id=%s ORDER BY id
                """, (blocked.id,))
                self.assertIn("confirmed", [row[0] for row in cursor.fetchall()])
        finally:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM jobs WHERE id=ANY(%s)",
                               (list(reversed(job_ids)),))
            connection.commit()
            connection.close()

    def test_ambiguous_block_cannot_use_cost_confirmation(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        repository = jobs_module.JobRepository()
        job_id = None
        try:
            blocked, _ = repository.enqueue(
                "fixture_ambiguous_confirm", {"confirmed": False},
                idempotency_key=f"ambiguous-confirm-{uuid4()}")
            job_id = blocked.id
            repository.claim_next(["fixture_ambiguous_confirm"])
            repository.fail(blocked.id, "response lost", result={
                "needs_confirmation": True, "requires_review": True,
                "ambiguous": True})
            with self.assertRaisesRegex(ValueError, "cost confirmation"):
                repository.confirm(
                    blocked.public_id,
                    idempotency_key=f"unsafe-confirm-{uuid4()}")
        finally:
            if job_id is not None:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM jobs WHERE id=%s", (job_id,))
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
                "speech", {"text": "test", "voice": "Cherry", "engine": "audio", "model": "plus"},
                idempotency_key=f"rollback-test-{uuid4()}", source_tool="speak",
                operation_label="Generate speech",
            )
            self.assertTrue(created)
            with connection.cursor() as cursor:
                cursor.execute("SELECT actor_id, organization_id, source_tool, operation_label, model FROM jobs WHERE id = %s", (job.id,))
                self.assertEqual(cursor.fetchone(), ("local-owner", "local-studio", "speak", "Generate speech", "qwen-audio-3.0-tts-plus"))
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
