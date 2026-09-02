import unittest

from origins.application.workspaces import WorkspaceService
from origins.domain.work import DomainValidation


class FakeWorkspaceRecords:
    def __init__(self):
        self.created = []

    def list_workspaces(self):
        return [{"id": 4, "name": "Hudson"}]

    def workspace(self, workspace_id):
        return {"id": workspace_id, "name": "Hudson"} if workspace_id == 4 else None

    def project(self, identifier):
        return {"id": 12, "public_id": "project-12"} if str(identifier) in {"12", "project-12"} else None

    def folders(self, workspace_id):
        return [{"id": 9, "workspace_id": workspace_id, "name": "Campaign"}]

    def projects(self, workspace_id):
        return [{"id": 12, "workspace_id": workspace_id, "project_type": "audiovisual"}]

    def files(self, workspace_id):
        return [{"id": 31, "workspace_id": workspace_id, "name": "Score.wav"}]

    def create_workspace(self, name, description):
        self.created.append(("workspace", name, description))
        return {"id": 5, "name": name}

    def create_folder(self, workspace_id, name, parent_id):
        self.created.append(("folder", workspace_id, name, parent_id))
        return {"id": 10, "workspace_id": workspace_id, "name": name}

    def create_audiovisual_project(self, workspace_id, name, description, folder_id):
        self.created.append(("project", workspace_id, name, description, folder_id))
        return {"id": 13, "workspace_id": workspace_id, "name": name}


class WorkspaceServiceTests(unittest.TestCase):
    def setUp(self):
        self.records = FakeWorkspaceRecords()
        self.service = WorkspaceService(self.records)

    def test_overview_groups_files_folders_and_typed_projects(self):
        overview = self.service.overview(4)
        self.assertEqual(overview["workspace"]["name"], "Hudson")
        self.assertEqual(overview["folders"][0]["workspace_id"], 4)
        self.assertEqual(overview["projects"][0]["project_type"], "audiovisual")
        self.assertEqual(overview["files"][0]["name"], "Score.wav")

    def test_project_creation_is_direct_not_a_creation_action(self):
        project = self.service.create_audiovisual_project(
            4, "  Episode 1  ", "  Pilot  ", 9)
        self.assertEqual(project["name"], "Episode 1")
        self.assertEqual(
            self.records.created[-1],
            ("project", 4, "Episode 1", "Pilot", 9))

    def test_project_identity_resolves_without_the_work_hierarchy(self):
        self.assertEqual(self.service.project("project-12")["id"], 12)

    def test_blank_names_are_rejected(self):
        with self.assertRaises(DomainValidation):
            self.service.create_workspace("  ")
        with self.assertRaises(DomainValidation):
            self.service.create_folder(4, "  ")


if __name__ == "__main__":
    unittest.main()
