"""Real PostgreSQL checks for the Space-first creation boundary."""

from __future__ import annotations

import unittest
from uuid import uuid4

import psycopg

from audio_studio.application.spaces import SpaceService
from audio_studio.config import settings
from audio_studio.infrastructure.postgres.spaces import SpaceRepository


class SpaceRepositoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            raise unittest.SkipTest(str(error)) from error
        connection.close()

    def setUp(self):
        self.service = SpaceService(SpaceRepository())
        self.marker = uuid4().hex[:12]
        self.space = self.service.create_space(
            f"Space fixture {self.marker}", "Disposable integration fixture")

    def tearDown(self):
        space_id = int(self.space["id"])
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute(
                    "SELECT id FROM work_projects WHERE venture_id=%s",
                    (space_id,))
                work_project_ids = [int(row[0]) for row in cursor.fetchall()]
                cursor.execute(
                    "SELECT id FROM productions WHERE space_id=%s",
                    (space_id,))
                project_ids = [int(row[0]) for row in cursor.fetchall()]
                cursor.execute("DELETE FROM spaces WHERE id=%s", (space_id,))
                if project_ids:
                    cursor.execute("DELETE FROM projects WHERE id=ANY(%s)",
                                   (project_ids,))
                if work_project_ids:
                    cursor.execute("DELETE FROM work_projects WHERE id=ANY(%s)",
                                   (work_project_ids,))
                    cursor.execute("DELETE FROM projects WHERE id=ANY(%s)",
                                   (work_project_ids,))
                cursor.execute("DELETE FROM ventures WHERE id=%s", (space_id,))
                cursor.execute("DELETE FROM projects WHERE id=%s", (space_id,))
            database.commit()

    def test_folder_and_audiovisual_project_are_direct_space_children(self):
        space_id = int(self.space["id"])
        folder = self.service.create_folder(space_id, "Campaign")
        project = self.service.create_audiovisual_project(
            space_id, "Launch film", "Audiovisual Project", folder["id"])

        overview = self.service.overview(space_id)
        self.assertEqual(overview["space"]["name"],
                         f"Space fixture {self.marker}")
        self.assertEqual(overview["folders"][0]["name"], "Campaign")
        self.assertEqual(overview["projects"][0]["id"], project["id"])
        self.assertEqual(overview["projects"][0]["folder_id"], folder["id"])
        self.assertEqual(overview["projects"][0]["project_type"],
                         "audiovisual")

        listed = next(
            item for item in self.service.list_spaces()
            if item["id"] == space_id)
        self.assertEqual(listed["project_count"], 1)
        self.assertEqual(listed["folder_count"], 1)


if __name__ == "__main__":
    unittest.main()
