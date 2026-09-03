"""Real HTTP Job lifecycle using an inert, non-provider fixture kind."""

from uuid import UUID, uuid4
import unittest

from fastapi.testclient import TestClient
import psycopg

from origins.config import settings
from origins.http.app import app
from origins.infrastructure.postgres.jobs import JobRepository
from origins.infrastructure.postgres.workspaces import WorkspaceRepository


class JobHttpTests(unittest.TestCase):
    def test_workspace_audio_creation_exposes_exact_job_ownership(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        job_id = None
        workspace = WorkspaceRepository().create_workspace(
            "HTTP audio Workspace", "Disposable Job HTTP fixture")
        workspace_id = int(workspace["id"])
        client = TestClient(app)
        try:
            response = client.post(
                "/api/v1/jobs/audio-generation",
                headers={"Idempotency-Key": f"workspace-audio-http-{uuid4()}"},
                json={
                    "capability": "sfx",
                    "prompt": "A short ceramic tap",
                    "seconds": 2,
                    "workspace_id": workspace_id,
                },
            )

            self.assertEqual(response.status_code, 202, response.text)
            data = response.json()["data"]
            job = JobRepository().get(UUID(data["id"]))
            job_id = job.id
            self.assertEqual(data["workspace_id"], workspace_id)
            self.assertEqual(data["creation_action_id"],
                             "generate-sound-effect")
            self.assertEqual(data["context"], {
                "workspace_id": workspace_id,
                "production_id": None,
                "production_type": None,
            })
            self.assertEqual(data["output_file_ids"], [])
        finally:
            client.close()
            if job_id is not None:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM audit_records WHERE resource_type = 'job' "
                        "AND resource_id = %s", (str(job_id),))
                    cursor.execute("DELETE FROM jobs WHERE id = %s", (job_id,))
                connection.commit()
            connection.close()
            with psycopg.connect(settings.database_url) as cleanup:
                cleanup.execute(
                    "DELETE FROM workspaces WHERE id=%s", (workspace_id,))

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

    def test_cost_confirmation_continues_once_and_review_blocks_cannot_continue(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))
        repository = JobRepository()
        jobs = []
        client = TestClient(app)
        try:
            source, _ = repository.enqueue(
                "fixture_http_confirm", {"confirmed": False, "route": "exact"},
                idempotency_key=f"fixture-http-confirm-{uuid4()}")
            jobs.append(source)
            repository.claim_next(["fixture_http_confirm"])
            repository.finish(source.id, {
                "needs_confirmation": True, "estimate": .04,
            }, status="blocked")

            first = client.post(
                f"/api/v1/jobs/{source.public_id}/confirm",
                headers={"Idempotency-Key": f"http-confirm-{uuid4()}"})
            second = client.post(
                f"/api/v1/jobs/{source.public_id}/confirm",
                headers={"Idempotency-Key": f"http-second-click-{uuid4()}"})
            self.assertEqual(first.status_code, 202, first.text)
            self.assertEqual(second.status_code, 202, second.text)
            self.assertTrue(first.json()["meta"]["created"])
            self.assertFalse(second.json()["meta"]["created"])
            self.assertEqual(first.json()["data"]["id"], second.json()["data"]["id"])
            child = repository.get(UUID(first.json()["data"]["id"]))
            jobs.append(child)
            self.assertTrue(child.payload["confirmed"])

            ambiguous, _ = repository.enqueue(
                "fixture_http_ambiguous", {"confirmed": False},
                idempotency_key=f"fixture-http-ambiguous-{uuid4()}")
            jobs.append(ambiguous)
            repository.claim_next(["fixture_http_ambiguous"])
            repository.fail(ambiguous.id, "response lost", result={
                "needs_confirmation": True,
                "requires_review": True,
                "ambiguous": True,
            })
            rejected = client.post(
                f"/api/v1/jobs/{ambiguous.public_id}/confirm")
            self.assertEqual(rejected.status_code, 409, rejected.text)
            self.assertEqual(
                rejected.json()["error"]["code"], "job_not_confirmable")
        finally:
            client.close()
            ids = [job.id for job in jobs if job is not None]
            if ids:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM audit_records WHERE resource_type = 'job' "
                        "AND resource_id = ANY(%s)",
                        ([str(identifier) for identifier in ids],))
                    cursor.execute(
                        "DELETE FROM jobs WHERE id = ANY(%s)",
                        (list(reversed(ids)),))
                connection.commit()
            connection.close()


if __name__ == "__main__":
    unittest.main()
