"""Real PostgreSQL checks for the canonical Work lifecycle. No provider calls."""

from __future__ import annotations

import unittest
from uuid import uuid4

import psycopg

from audio_studio.composition.work import work_service as work
from audio_studio.config import settings
from audio_studio.domain.work import DomainConflict
from audio_studio.infrastructure.postgres.activity import ActivityRepository


class WorkRepositoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            raise unittest.SkipTest(str(error)) from error
        connection.close()

    def setUp(self):
        self.marker = uuid4().hex[:12]
        self.created_project_rows: list[int] = []
        self.receipt_resource_ids: list[str] = []
        self.preserved_job_ids: list[int] = []
        self.venture = work.create(
            "ventures", None, f"Work fixture {self.marker}", "Fixture Venture")
        self.assertIsNotNone(self.venture)
        self.created_project_rows.append(self.venture["id"])

    def tearDown(self):
        venture_id = int(self.venture["id"])
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    DELETE FROM productions WHERE project_id IN (
                      SELECT id FROM work_projects WHERE venture_id = %s)
                """, (venture_id,))
                cursor.execute("""
                    DELETE FROM series WHERE project_id IN (
                      SELECT id FROM work_projects WHERE venture_id = %s)
                """, (venture_id,))
                cursor.execute("DELETE FROM work_projects WHERE venture_id = %s",
                               (venture_id,))
                cursor.execute("DELETE FROM ventures WHERE id = %s", (venture_id,))
                if self.created_project_rows:
                    cursor.execute("DELETE FROM projects WHERE id = ANY(%s)",
                                   (self.created_project_rows,))
                if self.receipt_resource_ids:
                    cursor.execute("""
                        DELETE FROM audit_records
                         WHERE action='production.deleted'
                           AND resource_id=ANY(%s)
                    """, (self.receipt_resource_ids,))
                if self.preserved_job_ids:
                    cursor.execute("DELETE FROM provider_attempts WHERE job_id=ANY(%s)",
                                   (self.preserved_job_ids,))
                    cursor.execute("DELETE FROM jobs WHERE id=ANY(%s)",
                                   (self.preserved_job_ids,))
            database.commit()

    def test_hierarchy_overviews_and_series_lifecycle_remain_consistent(self):
        venture_id = int(self.venture["id"])
        project = work.create(
            "projects", venture_id, f"Project {self.marker}", "Fixture Project")
        other_project = work.create(
            "projects", venture_id, f"Other {self.marker}", "Other Project")
        self.assertIsNotNone(project)
        self.assertIsNotNone(other_project)
        self.created_project_rows.extend([project["id"], other_project["id"]])

        series = work.create(
            "series", project["id"], f"Series {self.marker}", "Fixture Series")
        foreign_series = work.create(
            "series", other_project["id"], f"Foreign {self.marker}", "Foreign Series")
        work.update("series", series["id"], {"defaults": {
            "language": "Arabic",
        }})
        production = work.create_in_series(
            series["id"], f"Production {self.marker}", "Fixture Production")
        self.assertIsNotNone(series)
        self.assertIsNotNone(foreign_series)
        self.assertIsNotNone(production)
        self.assertEqual(production["settings"], {
            "language": "Arabic",
        })
        self.created_project_rows.append(production["id"])

        keys = {item["key"] for item in work.hierarchy()}
        self.assertTrue({self.venture["key"], project["key"], series["key"],
                         production["key"]}.issubset(keys))
        self.assertEqual(
            [item["type"] for item in work.resource(
                "productions", production["id"])["trail"]],
            ["venture", "project", "series"],
        )
        self.assertEqual(
            work.overview("projects", project["id"])["metrics"]["production_count"],
            1,
        )
        self.assertEqual(
            work.overview("series", series["id"])["metrics"]["production_count"],
            1,
        )

        with self.assertRaises(DomainConflict):
            work.update("productions", production["id"],
                        {"series_id": foreign_series["id"]})
        with self.assertRaises(DomainConflict):
            work.remove("series", series["id"])

        removed = work.remove("series", series["id"], make_standalone=True)
        self.assertEqual(removed["productions_made_standalone"], 1)
        standalone = work.resource("productions", production["id"])
        self.assertIsNone(standalone["series_id"])
        self.assertEqual(
            work.overview("projects", project["id"])["standalone_productions"][0]["id"],
            production["id"],
        )

        archived = work.remove("projects", project["id"])
        self.assertTrue(archived["archived"])
        self.assertIsNone(work.resource("projects", project["id"]))
        self.assertIsNone(work.resource("productions", production["id"]))

    def test_production_delete_is_permanent_not_archival(self):
        venture_id = int(self.venture["id"])
        project = work.create(
            "projects", venture_id, f"Delete project {self.marker}")
        production = work.create(
            "productions", project["id"], f"Delete production {self.marker}")
        self.receipt_resource_ids.append(production["public_id"])
        self.created_project_rows.extend([project["id"], production["id"]])
        with psycopg.connect(settings.database_url) as database:
            part_id = database.execute("""
                INSERT INTO production_parts
                    (production_id,position,kind,script,title,editorial_status)
                VALUES (%s,0,'draft','private deleted script','', 'draft')
                RETURNING id
            """, (production["id"],)).fetchone()[0]
            database.execute("""
                INSERT INTO transcripts (name,text,srt,vtt,part_id)
                VALUES ('private caption','private deleted script',
                        'private deleted script','private deleted script',%s)
            """, (part_id,))
            job_id, job_public_id = database.execute("""
                INSERT INTO jobs
                    (kind,status,estimated,cost,project_id,production_id,
                     part_id,model,voice,detail,error,payload,result,
                     output_ids,chars,cost_basis,finished_at)
                VALUES ('speech','ok',0.125,0.125,%s,%s,%s,
                        'qwen-audio-3.0-tts-flash','private-voice',
                        'private deleted detail','private deleted error',
                        '{"text":"private deleted script"}'::jsonb,
                        '{"filename":"private-output.mp3"}'::jsonb,
                        '["private-output.mp3"]'::jsonb,22,
                        'catalog_characters',now())
                RETURNING id,public_id::text
            """, (production["id"], production["id"], part_id)).fetchone()
            self.preserved_job_ids.append(int(job_id))
            database.execute("""
                INSERT INTO provider_attempts
                    (job_id,operation,provider,provider_region,route,
                     payload_fingerprint,status,estimated_cost,cost,cost_basis,
                     error,diagnostics,finished_at)
                VALUES (%s,'speech.generate','alibaba','intl',
                        '{"model_id":"qwen-audio-3.0-tts-flash"}'::jsonb,
                        'content-free-fingerprint','succeeded',0.125,0.125,
                        'catalog_characters','{"private":"error"}'::jsonb,
                        '{"private":"diagnostic"}'::jsonb,now())
            """, (job_id,))
            database.commit()

        deleted = work.remove("productions", production["id"])

        self.assertEqual(deleted, {
            "id": production["id"], "type": "production", "deleted": True,
        })
        self.assertIsNone(work.resource("productions", production["id"]))
        with psycopg.connect(settings.database_url) as database:
            self.assertIsNone(database.execute(
                "SELECT id FROM productions WHERE id=%s",
                (production["id"],),
            ).fetchone())
            self.assertIsNone(database.execute(
                "SELECT id FROM projects WHERE id=%s",
                (production["id"],),
            ).fetchone())
            receipt = database.execute("""
                SELECT action, resource_type, detail
                  FROM audit_records WHERE resource_id=%s
            """, (production["public_id"],)).fetchone()
            self.assertEqual(receipt, (
                "production.deleted", "production", {
                    "permanent": True, "parts": 1, "recordings": 0,
                    "captions": 1, "exports": 0, "operations": 1,
                    "provider_attempts": 1, "retained_spend": 0.125,
                },
            ))
            retained = database.execute("""
                SELECT production_id,project_id,part_id,clip_id,
                       legacy_generation_id,payload,result,output_ids,chars,
                       detail,error,cost
                  FROM jobs WHERE id=%s
            """, (job_id,)).fetchone()
            self.assertEqual(retained, (
                None, None, None, None, None, {}, {}, [], 0,
                "Deleted Production activity", None, 0.125,
            ))
            attempt = database.execute("""
                SELECT job_id,cost,error,diagnostics
                  FROM provider_attempts WHERE job_id=%s
            """, (job_id,)).fetchone()
            self.assertEqual(attempt, (job_id, 0.125, {}, {}))

        activity = ActivityRepository().snapshot(
            kind="production_deleted", limit=10)
        run = next(item for item in activity["runs_list"]
                   if item["event_detail"] == receipt[2])
        self.assertEqual((run["record_type"], run["operation"], run["cost"]),
                         ("audit", "Production deleted", 0.0))
        self.assertNotIn(production["name"], str(run))
        self.assertNotIn("private deleted script", str(run))
        retained_run = next(item for item in ActivityRepository().snapshot(
            limit=50)["runs_list"] if item["id"] == job_public_id)
        self.assertEqual(retained_run["cost"], 0.125)
        self.assertEqual(retained_run["detail"], "Deleted Production activity")
        self.assertNotIn("private deleted", str(retained_run))


if __name__ == "__main__":
    unittest.main()
