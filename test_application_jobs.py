"""Durable Job application service tests with no database or provider calls."""

from datetime import datetime, timezone
from uuid import uuid4
import unittest

from audio_studio.application.jobs import JobService
from audio_studio.domain.jobs import Job, JobCancelled, JobStatus


def fixture_job(kind: str = "fixture", status: JobStatus = JobStatus.QUEUED):
    return Job(
        id=7, public_id=uuid4(), kind=kind, status=status,
        created_at=datetime.now(timezone.utc),
    )


class FakeJobStore:
    def __init__(self, claimed=None):
        self.claimed = claimed
        self.finished = []
        self.failed = []
        self.cancelled = None
        self.stale_seconds = None
        self.saved = fixture_job()

    def heartbeat(self, job_id):
        return True

    def progress(self, job_id, done, total, detail=""):
        pass

    def claim_next(self, kinds):
        result, self.claimed = self.claimed, None
        return result

    def finish(self, job_id, result, **values):
        self.finished.append((job_id, result, values))
        return True

    def fail(self, job_id, error, retry=False):
        self.failed.append((job_id, error, retry))

    def enqueue(self, kind, payload, **values):
        self.enqueued = (kind, payload, values)
        return self.saved, True

    def get(self, public_id):
        return self.saved if public_id == self.saved.public_id else None

    def events(self, public_id):
        return [{"id": 1, "kind": "queued"}]

    def cancel(self, public_id):
        self.cancelled = public_id
        return self.saved

    def abandon_stale(self, older_than_seconds=120):
        self.stale_seconds = older_than_seconds
        return 2


class JobServiceTests(unittest.TestCase):
    def test_api_lifecycle_delegates_to_one_store(self):
        store = FakeJobStore()
        service = JobService(store)
        saved, created = service.enqueue(
            "speech", {"text": "Hello"}, idempotency_key="key")

        self.assertTrue(created)
        self.assertIs(saved, store.saved)
        self.assertEqual(store.enqueued[0], "speech")
        self.assertIs(service.get(saved.public_id), saved)
        self.assertEqual(service.events(saved.public_id)[0]["kind"], "queued")
        self.assertIs(service.cancel(saved.public_id), saved)
        self.assertEqual(store.cancelled, saved.public_id)
        self.assertEqual(service.abandon_stale(45), 2)
        self.assertEqual(store.stale_seconds, 45)

    def test_worker_finishes_success_with_normalized_status(self):
        job = fixture_job("speech")
        store = FakeJobStore(job)
        service = JobService(store)
        service.register(
            "speech", lambda _job, _progress: {
                "id": 9, "cost": .25, "usage": {"output_audio": 10},
                "warning": "Provider changed the text",
            })

        self.assertTrue(service.work_once())
        job_id, result, values = store.finished[0]
        self.assertEqual((job_id, result["id"]), (job.id, 9))
        self.assertEqual(values["status"], "warning")
        self.assertEqual(values["cost"], .25)
        self.assertEqual(values["usage"], {"output_audio": 10})
        self.assertFalse(store.failed)

    def test_worker_records_failure_without_retrying_paid_work(self):
        job = fixture_job("speech")
        store = FakeJobStore(job)
        service = JobService(store)

        def fail(_job, _progress):
            raise RuntimeError("provider response was lost")

        service.register("speech", fail)
        self.assertTrue(service.work_once())
        self.assertFalse(store.finished)
        self.assertEqual(store.failed[0][0], job.id)
        self.assertIn("provider response was lost", store.failed[0][1])
        self.assertFalse(store.failed[0][2])

    def test_cooperative_cancellation_is_not_reclassified_as_failure(self):
        job = fixture_job("speech")
        store = FakeJobStore(job)
        service = JobService(store)

        def cancel(_job, _progress):
            raise JobCancelled("operator")

        service.register("speech", cancel)
        self.assertTrue(service.work_once())
        self.assertFalse(store.finished)
        self.assertFalse(store.failed)

    def test_worker_reports_idle_without_touching_state(self):
        store = FakeJobStore()
        service = JobService(store)
        service.register("speech", lambda _job, _progress: {})
        self.assertFalse(service.work_once())
        self.assertFalse(store.finished)
        self.assertFalse(store.failed)


if __name__ == "__main__":
    unittest.main()
