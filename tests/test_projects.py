"""Real PostgreSQL checks for Projects as grouping-only Workspace resources."""

from __future__ import annotations

import unittest
from uuid import uuid4

import psycopg

from origins.application.projects import ProjectService
from origins.application.productions import ProductionService
from origins.application.workspaces import WorkspaceService
from origins.config import settings
from origins.domain.work import DomainValidation
from origins.infrastructure.postgres.files import FileRepository
from origins.infrastructure.postgres.production_service import PostgresProductionRecords
from origins.infrastructure.postgres.projects import ProjectRepository
from origins.infrastructure.postgres.workspaces import WorkspaceRepository


class ProjectRepositoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            raise unittest.SkipTest(str(error)) from error
        connection.close()

    def setUp(self):
        self.workspace_service = WorkspaceService(WorkspaceRepository())
        self.project_service = ProjectService(ProjectRepository())
        self.production_service = ProductionService(PostgresProductionRecords())
        self.workspace_ids: list[int] = []
        marker = uuid4().hex[:12]
        self.workspace = self.workspace_service.create_workspace(
            f"Project fixture {marker}", "Disposable integration fixture")
        self.workspace_ids.append(int(self.workspace["id"]))

    def tearDown(self):
        with psycopg.connect(settings.database_url) as database:
            for workspace_id in self.workspace_ids:
                database.execute("DELETE FROM workspaces WHERE id=%s", (workspace_id,))
            database.commit()

    def test_project_can_live_at_workspace_root_or_in_a_folder(self):
        workspace_id = int(self.workspace["id"])
        folder = self.workspace_service.create_folder(workspace_id, "Campaign")
        root = self.project_service.create(workspace_id, "Brand launch")
        placed = self.project_service.create(
            workspace_id, "Retail launch", "In-store initiative", int(folder["id"]))

        self.assertIsNone(root["folder_id"])
        self.assertEqual(placed["folder_id"], folder["id"])
        overview = self.workspace_service.overview(workspace_id)
        self.assertEqual({item["id"] for item in overview["projects"]},
                         {root["id"], placed["id"]})
        listed = next(item for item in self.workspace_service.list_workspaces()
                      if item["id"] == workspace_id)
        self.assertEqual(listed["project_count"], 2)

    def test_membership_moves_without_copying_or_changing_production_state(self):
        workspace_id = int(self.workspace["id"])
        folder = self.workspace_service.create_folder(workspace_id, "Production files")
        project = self.project_service.create(workspace_id, "Nike Summer Launch")
        production = self.workspace_service.create_audiovisual_production(
            workspace_id, "Hero Film", "Audiovisual Production", int(folder["id"]))
        files = FileRepository()
        file = files.create_workspace_file(
            workspace_id, name="Hero source", filename="hero.png",
            path="/tmp/hero.png", size_bytes=64, duration_ms=None,
            audio_format=None, mime_type="image/png", media_type="image")
        self.assertTrue(files.attach_to_production_library(
            int(production["id"]), int(file["id"])))

        with psycopg.connect(settings.database_url) as database:
            before = database.execute("""
                SELECT production.id, production.folder_id, sound.document,
                       visual.document, count(DISTINCT file.id),
                       count(DISTINCT version.id)
                  FROM productions production
                  JOIN sound_scenes sound ON sound.production_id=production.id
                  JOIN visual_scenes visual ON visual.production_id=production.id
                  LEFT JOIN files file ON file.workspace_id=production.workspace_id
                  LEFT JOIN file_versions version ON version.file_id=file.id
                 WHERE production.id=%s
                 GROUP BY production.id, sound.document, visual.document
            """, (production["id"],)).fetchone()

        attached = self.production_service.update_production(
            int(production["id"]), {"project_id": int(project["id"])})
        self.assertEqual(attached["id"], production["id"])
        self.assertEqual(attached["project_id"], project["id"])
        self.assertEqual(attached["folder_id"], folder["id"])
        self.assertEqual(
            [item["id"] for item in self.project_service.project(
                project["public_id"])["productions"]],
            [production["id"]],
        )
        summary = self.project_service.project(
            project["public_id"])["productions"][0]
        self.assertEqual(set(summary), {
            "id", "public_id", "workspace_id", "folder_id", "project_id",
            "production_type", "name", "description", "status", "updated_at",
        })
        self.assertNotIn("part_count", summary)

        detached = self.production_service.update_production(
            int(production["id"]), {"project_id": None})
        self.assertIsNone(detached["project_id"])
        with psycopg.connect(settings.database_url) as database:
            after = database.execute("""
                SELECT production.id, production.folder_id, sound.document,
                       visual.document, count(DISTINCT file.id),
                       count(DISTINCT version.id)
                  FROM productions production
                  JOIN sound_scenes sound ON sound.production_id=production.id
                  JOIN visual_scenes visual ON visual.production_id=production.id
                  LEFT JOIN files file ON file.workspace_id=production.workspace_id
                  LEFT JOIN file_versions version ON version.file_id=file.id
                 WHERE production.id=%s
                 GROUP BY production.id, sound.document, visual.document
            """, (production["id"],)).fetchone()
        self.assertEqual(after, before)

    def test_cross_workspace_membership_is_rejected(self):
        workspace_id = int(self.workspace["id"])
        production = self.workspace_service.create_audiovisual_production(
            workspace_id, "Standalone Film")
        other = self.workspace_service.create_workspace(
            f"Other Project Workspace {uuid4().hex[:8]}")
        self.workspace_ids.append(int(other["id"]))
        foreign_project = self.project_service.create(
            int(other["id"]), "Foreign initiative")

        with self.assertRaises(DomainValidation):
            self.production_service.update_production(
                int(production["id"]), {"project_id": int(foreign_project["id"])})
        self.assertIsNone(self.workspace_service.production(
            production["public_id"])["project_id"])

        with self.assertRaises(psycopg.errors.ForeignKeyViolation):
            with psycopg.connect(settings.database_url) as database:
                database.execute(
                    "UPDATE productions SET project_id=%s WHERE id=%s",
                    (foreign_project["id"], production["id"]))

    def test_deleting_project_preserves_production_files_versions_and_scenes(self):
        workspace_id = int(self.workspace["id"])
        project = self.project_service.create(workspace_id, "Campaign")
        production = self.workspace_service.create_audiovisual_production(
            workspace_id, "Campaign Film")
        self.production_service.update_production(
            int(production["id"]), {"project_id": int(project["id"])})
        file = FileRepository().create_workspace_file(
            workspace_id, name="Reusable score", filename="score.wav",
            path="/tmp/score.wav", size_bytes=128, duration_ms=1000,
            audio_format="wav", mime_type="audio/wav", media_type="audio")
        file_id = int(file["id"])
        version_id = int(file["version_id"])
        self.assertTrue(FileRepository().attach_to_production_library(
            int(production["id"]), file_id))

        deleted = self.project_service.delete(int(project["id"]))

        self.assertEqual(deleted, {
            "id": int(project["id"]), "type": "project", "deleted": True})
        with psycopg.connect(settings.database_url) as database:
            self.assertIsNone(database.execute(
                "SELECT id FROM projects WHERE id=%s", (project["id"],)).fetchone())
            self.assertEqual(database.execute(
                "SELECT id, project_id FROM productions WHERE id=%s",
                (production["id"],)).fetchone(), (production["id"], None))
            self.assertEqual(database.execute(
                "SELECT id, workspace_id FROM files WHERE id=%s",
                (file_id,)).fetchone(), (file_id, workspace_id))
            self.assertEqual(database.execute(
                "SELECT id, file_id FROM file_versions WHERE id=%s",
                (version_id,)).fetchone(), (version_id, file_id))
            self.assertIsNotNone(database.execute(
                "SELECT 1 FROM production_file_usages "
                "WHERE production_id=%s AND file_id=%s",
                (production["id"], file_id)).fetchone())
            self.assertIsNotNone(database.execute(
                "SELECT production_id FROM sound_scenes WHERE production_id=%s",
                (production["id"],)).fetchone())
            self.assertIsNotNone(database.execute(
                "SELECT production_id FROM visual_scenes WHERE production_id=%s",
                (production["id"],)).fetchone())


if __name__ == "__main__":
    unittest.main()
