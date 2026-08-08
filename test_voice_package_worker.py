"""Native Voice package tests. Alibaba creation is always faked."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from uuid import uuid4

import psycopg

from audio_studio.application.voice_cloning import VoiceCloningService
from audio_studio.config import settings
from audio_studio.domain.voice_packages import (
    CreatedVoiceBinding,
    VoicePackageJob,
)
from audio_studio.infrastructure.postgres.voice_packages import VoicePackageRepository
from audio_studio.infrastructure.voice_reference_workspace import VoiceReferenceWorkspace


ROOT = Path(__file__).parent


def package_job(**changes):
    values = {
        "id": "vjob_test", "identity_id": "voice_test",
        "reference_id": "ref_test", "model_id": "qwen3.5-omni-flash",
        "engine": "omni", "tier": "flash", "attempts": 1,
        "name": "Test Voice", "metadata": {"language": "en"},
    }
    return VoicePackageJob(**{**values, **changes})


class FakeRepository:
    def __init__(self, job=None, reference=None):
        self.next = job
        self.saved_reference = reference or {
            "id": "ref_test", "normalized_path": "source.wav"}
        self.started = []
        self.completed = []
        self.failed = []

    def claim_next(self):
        job, self.next = self.next, None
        return job

    def reference(self, _reference_id):
        return self.saved_reference

    def start_attempt(self, job, estimate):
        self.started.append((job, estimate))
        return 72

    def complete(self, job, activity_id, binding):
        self.completed.append((job, activity_id, binding))

    def fail(self, job, activity_id, error):
        self.failed.append((job, activity_id, error))


class FakeProvider:
    def __init__(self, error=None):
        self.error = error
        self.calls = []

    def estimated_cost(self, _job):
        return .01

    def create(self, job, local):
        self.calls.append((job, local))
        if self.error:
            raise self.error
        return CreatedVoiceBinding(
            provider_voice_id="provider_voice_test", provider_region="intl",
            provider_endpoint="https://provider.test", price_version="fixture",
            estimated_cost=.01, cost=.01, cost_basis="catalog_creation",
        )


class VoicePackageWorkerTests(unittest.TestCase):
    def test_service_claims_resolves_and_completes_one_capability(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "source.wav").write_bytes(b"RIFF-test")
            repository = FakeRepository(package_job())
            provider = FakeProvider()
            service = VoiceCloningService(
                repository, provider, VoiceReferenceWorkspace(root))
            self.assertTrue(service.work_once())
            self.assertFalse(service.work_once())
        self.assertEqual(repository.started[0][1], .01)
        self.assertEqual(repository.completed[0][1], 72)
        self.assertEqual(
            repository.completed[0][2].provider_voice_id,
            "provider_voice_test")
        self.assertEqual(repository.failed, [])
        self.assertEqual(len(provider.calls), 1)

    def test_provider_failure_is_terminal_until_an_explicit_retry(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "source.wav").write_bytes(b"RIFF-test")
            repository = FakeRepository(package_job())
            provider = FakeProvider(RuntimeError("ambiguous provider failure"))
            service = VoiceCloningService(
                repository, provider, VoiceReferenceWorkspace(root))
            self.assertTrue(service.work_once())
        self.assertEqual(repository.completed, [])
        self.assertIn("ambiguous provider failure", repository.failed[0][2])

    def test_reference_workspace_rejects_escape_and_missing_files(self):
        with TemporaryDirectory() as directory:
            workspace = VoiceReferenceWorkspace(Path(directory))
            with self.assertRaisesRegex(RuntimeError, "invalid"):
                workspace.resolve("../voice.wav")
            with self.assertRaisesRegex(RuntimeError, "missing"):
                workspace.resolve("voice.wav")

    def test_postgres_package_lifecycle_is_atomic_and_does_not_auto_retry(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            self.skipTest(str(error))
        connection.close()
        repository = VoicePackageRepository()
        marker = uuid4().hex
        reference_id = repository.create_reference(
            original_name=f"{marker}.wav", original_path=f"{marker}.wav",
            normalized_path=f"{marker}-24k.wav")
        identity_id = None
        try:
            identity_id, queued = repository.create_package(
                name=f"Voice {marker[:8]}",
                metadata={"language": "en", "trait": "Fixture"},
                reference_id=reference_id, identity_id=None,
                routes=[{"model_id": "fixture-omni-flash", "engine": "omni",
                         "tier": "flash"}], estimate=.01,
            )
            self.assertEqual(len(queued), 1)
            job_id = queued[0]
            with psycopg.connect(settings.database_url) as database:
                with database.cursor() as cursor:
                    cursor.execute("""
                        UPDATE voice_package_jobs SET status = 'interrupted'
                         WHERE id = %s
                    """, (job_id,))
                database.commit()
            self.assertIsNone(repository.claim_next(job_id))
            _, duplicate_queue = repository.create_package(
                name=f"Voice {marker[:8]}",
                metadata={"language": "en", "trait": "Fixture"},
                reference_id=reference_id, identity_id=identity_id,
                routes=[{"model_id": "fixture-omni-flash", "engine": "omni",
                         "tier": "flash"}], estimate=.01,
            )
            self.assertEqual(duplicate_queue, [])
            self.assertIsNone(repository.claim_next(job_id))
            self.assertEqual(repository.retry(identity_id, "fixture-omni-flash"),
                             job_id)
            claimed = repository.claim_next(job_id)
            self.assertEqual(claimed.id, job_id)
            self.assertEqual(claimed.attempts, 1)
            activity_id = repository.start_attempt(claimed, .01)
            repository.complete(claimed, activity_id, CreatedVoiceBinding(
                provider_voice_id=f"fixture-provider-{marker}",
                provider_region="intl", provider_endpoint="https://provider.test",
                price_version="fixture", estimated_cost=.01, cost=.01,
                cost_basis="catalog_creation",
            ))
            with psycopg.connect(settings.database_url) as database:
                with database.cursor() as cursor:
                    cursor.execute("""
                        SELECT status, provider_voice_id FROM voice_package_jobs
                         WHERE id = %s
                    """, (job_id,))
                    self.assertEqual(cursor.fetchone(),
                                     ("ready", f"fixture-provider-{marker}"))
                    cursor.execute("""
                        SELECT status, cost_basis, provider_region
                          FROM jobs WHERE id = %s
                    """, (activity_id,))
                    status, basis, region = cursor.fetchone()
                    self.assertEqual((status, basis, region),
                                     ("ok", "catalog_creation", "intl"))
        finally:
            with psycopg.connect(settings.database_url) as database:
                with database.cursor() as cursor:
                    cursor.execute("""
                        DELETE FROM jobs
                         WHERE voice_identity_id = %s
                            OR payload->>'reference_id' = %s
                    """, (identity_id, reference_id))
                    if identity_id:
                        cursor.execute("DELETE FROM voice_identities WHERE id = %s",
                                       (identity_id,))
                    cursor.execute("DELETE FROM voice_references WHERE id = %s",
                                   (reference_id,))
                database.commit()

    def test_active_runtime_has_no_legacy_voice_package_worker(self):
        worker = (ROOT / "audio_studio/worker.py").read_text()
        runtime = (ROOT / "audio_studio/runtime.py").read_text()
        self.assertNotIn("import db", worker)
        self.assertNotIn("import db", runtime)
        self.assertNotIn("voice_package_worker", worker)
        self.assertFalse((ROOT / "services/voice_package_worker.py").exists())
        self.assertFalse((ROOT / "server.py").exists())


if __name__ == "__main__":
    unittest.main()
