"""Real PostgreSQL checks for the canonical Work lifecycle. No provider calls."""

from __future__ import annotations

import unittest
from uuid import uuid4

import psycopg

from audio_studio.composition.work import work_service as work
from audio_studio.config import settings
from audio_studio.domain.work import DomainConflict


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
        self.venture = work.create(
            "ventures", None, f"Work fixture {self.marker}", "Fixture Venture")
        self.assertIsNotNone(self.venture)
        self.created_project_rows.append(self.venture["id"])

    def tearDown(self):
        venture_id = int(self.venture["id"])
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    DELETE FROM production_mixes
                     WHERE production_id IN (
                       SELECT id FROM productions WHERE project_id IN (
                         SELECT id FROM work_projects WHERE venture_id = %s))
                """, (venture_id,))
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
        self.created_project_rows.extend([project["id"], production["id"]])

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


if __name__ == "__main__":
    unittest.main()
