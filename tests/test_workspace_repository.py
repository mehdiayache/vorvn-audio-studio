"""Real PostgreSQL checks for the Workspace-first creation boundary."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

import psycopg

from origins.application.workspaces import WorkspaceService
from origins.application.uploads import UploadService
from origins.config import settings
from origins.infrastructure.postgres.workspaces import WorkspaceRepository
from origins.infrastructure.postgres.uploads import PostgresUploadRecords
from origins.infrastructure.postgres.files import FileRepository
from origins.infrastructure.upload_workspace import LocalUploadWorkspace


class WorkspaceRepositoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            raise unittest.SkipTest(str(error)) from error
        connection.close()

    def setUp(self):
        self.service = WorkspaceService(WorkspaceRepository())
        self.marker = uuid4().hex[:12]
        self.workspace = self.service.create_workspace(
            f"Workspace fixture {self.marker}", "Disposable integration fixture")

    def tearDown(self):
        workspace_id = int(self.workspace["id"])
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("DELETE FROM workspaces WHERE id=%s", (workspace_id,))
            database.commit()

    def test_folder_and_audiovisual_project_are_direct_workspace_children(self):
        workspace_id = int(self.workspace["id"])
        folder = self.service.create_folder(workspace_id, "Campaign")
        project = self.service.create_audiovisual_project(
            workspace_id, "Launch film", "Audiovisual Project", folder["id"])

        overview = self.service.overview(workspace_id)
        self.assertEqual(overview["workspace"]["name"],
                         f"Workspace fixture {self.marker}")
        self.assertEqual(overview["folders"][0]["name"], "Campaign")
        self.assertEqual(overview["projects"][0]["id"], project["id"])
        self.assertEqual(overview["projects"][0]["folder_id"], folder["id"])
        self.assertEqual(overview["projects"][0]["project_type"],
                         "audiovisual")

        with psycopg.connect(settings.database_url) as database:
            ownership = database.execute("""
                SELECT workspace_id, folder_id, project_type
                  FROM projects WHERE id=%s
            """, (project["id"],)).fetchone()
            self.assertEqual(
                ownership, (workspace_id, folder["id"], "audiovisual"))

        resolved = self.service.project(project["public_id"])
        self.assertEqual(resolved["id"], project["id"])

        listed = next(
            item for item in self.service.list_workspaces()
            if item["id"] == workspace_id)
        self.assertEqual(listed["project_count"], 1)
        self.assertEqual(listed["folder_count"], 1)

    def test_workspace_file_needs_no_intermediate_container(self):
        workspace_id = int(self.workspace["id"])
        project = self.service.create_audiovisual_project(
            workspace_id, "Direct media project")
        files = FileRepository()
        created = files.create_workspace_file(
            workspace_id, name="Direct still", filename="direct-still.png",
            path="/tmp/direct-still.png", size_bytes=128,
            duration_ms=None, audio_format=None, mime_type="image/png",
            media_type="image", media_format="png",
            width=1280, height=720)

        self.assertIsNotNone(created)
        with psycopg.connect(settings.database_url) as database:
            owner = database.execute("""
                SELECT workspace_id, folder_id, source
                  FROM files WHERE id=%s
            """, (created["id"],)).fetchone()
        self.assertEqual(owner, (workspace_id, None, "uploaded"))
        self.assertEqual(
            [item["id"] for item in files.list_for_project(project["id"])],
            [created["id"]])
        self.assertTrue(files.attach_to_project_library(
            project["id"], created["id"]))
        overview = self.service.overview(workspace_id)
        self.assertEqual(overview["files"][0]["id"], created["id"])
        self.assertEqual(overview["files"][0]["current_version"]["family"],
                         "image")
        self.assertEqual(overview["projects"][0]["file_count"], 1)

    def test_generated_file_lookup_never_crosses_space_ownership(self):
        files = FileRepository()
        candidate_id = f"candidate-{self.marker}"
        created, duplicate = files.create_generated_workspace_file(
            int(self.workspace["id"]), candidate_id=candidate_id,
            name="Generated cue", filename="generated-cue.wav",
            path="/tmp/generated-cue.wav", size_bytes=128,
            duration_ms=1000, audio_format="wav", mime_type="audio/wav",
            metadata={"origin": "generated", "external_id": candidate_id})
        other_space = self.service.create_workspace(
            f"Other Workspace {self.marker}", "Isolation fixture")
        try:
            self.assertFalse(duplicate)
            self.assertEqual(files.generated_workspace_file(
                workspace_id=int(self.workspace["id"]),
                candidate_id=candidate_id)["id"], created["id"])
            self.assertIsNone(files.generated_workspace_file(
                workspace_id=int(other_space["id"]),
                candidate_id=candidate_id))
        finally:
            with psycopg.connect(settings.database_url) as database:
                database.execute(
                    "DELETE FROM workspaces WHERE id=%s", (other_space["id"],))
                database.commit()

    def test_direct_document_upload_commits_one_file_version_without_a_job(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "incoming.upload"
            source.write_bytes(b"%PDF-1.4\nWorkspace fixture")
            uploads = UploadService(
                LocalUploadWorkspace(
                    root=root, output=root / "files",
                    references=root / "references"),
                PostgresUploadRecords(),
            )
            details = uploads.prepare_file_upload(
                "Campaign Brief.pdf", name="Campaign brief",
                supplied_tags=("reference",))
            created = uploads.save_workspace_file(
                int(self.workspace["id"]), source, source.stat().st_size,
                "Campaign Brief.pdf", details=details)

            overview = self.service.overview(int(self.workspace["id"]))
            file = next(item for item in overview["files"]
                        if item["id"] == created["id"])
            self.assertEqual(file["source"], "uploaded")
            self.assertEqual(file["current_version"]["family"], "document")
            self.assertEqual(file["current_version"]["mime_type"],
                             "application/pdf")
            with psycopg.connect(settings.database_url) as database:
                self.assertEqual(database.execute(
                    "SELECT count(*) FROM jobs WHERE %s=ANY(output_file_ids)",
                    (created["id"],)).fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
