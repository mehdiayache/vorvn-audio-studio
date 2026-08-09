"""Real HTTP Job lifecycle using an inert, non-provider fixture kind."""

from uuid import uuid4
import unittest

from fastapi.testclient import TestClient
import psycopg

from audio_studio.config import settings
from audio_studio.http.app import app
from audio_studio.infrastructure.postgres.jobs import JobRepository


class JobHttpTests(unittest.TestCase):
    def test_read_events_and_cancel_share_the_composed_service(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        job = None
        client = TestClient(app)
        try:
            job, created = JobRepository().enqueue(
                "fixture_http", {"safe": True},
                idempotency_key=f"fixture-http-{uuid4()}",
                source_tool="test", operation_label="Safe HTTP fixture",
            )
            self.assertTrue(created)

            read = client.get(f"/api/v1/jobs/{job.public_id}")
            events = client.get(f"/api/v1/jobs/{job.public_id}/events")
            cancelled = client.post(f"/api/v1/jobs/{job.public_id}/cancel")

            self.assertEqual(read.status_code, 200, read.text)
            self.assertEqual(read.json()["data"]["id"], str(job.public_id))
            self.assertEqual(events.status_code, 200, events.text)
            self.assertEqual(events.json()["meta"]["count"], 0)
            self.assertEqual(cancelled.status_code, 200, cancelled.text)
            self.assertEqual(cancelled.json()["data"]["status"], "cancelled")
        finally:
            client.close()
            if job is not None:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM audit_records WHERE resource_type = 'job' "
                        "AND resource_id = %s", (str(job.id),))
                    cursor.execute("DELETE FROM jobs WHERE id = %s", (job.id,))
                connection.commit()
            connection.close()


if __name__ == "__main__":
    unittest.main()
