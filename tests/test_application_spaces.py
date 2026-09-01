import unittest

from audio_studio.application.spaces import SpaceService
from audio_studio.domain.work import DomainValidation


class FakeSpaceRecords:
    def __init__(self):
        self.created = []

    def list_spaces(self):
        return [{"id": 4, "name": "Hudson"}]

    def space(self, space_id):
        return {"id": space_id, "name": "Hudson"} if space_id == 4 else None

    def project(self, identifier):
        return {"id": 12, "public_id": "project-12"} if str(identifier) in {"12", "project-12"} else None

    def folders(self, space_id):
        return [{"id": 9, "space_id": space_id, "name": "Campaign"}]

    def projects(self, space_id):
        return [{"id": 12, "space_id": space_id, "project_type": "audiovisual"}]

    def files(self, space_id):
        return [{"id": 31, "space_id": space_id, "name": "Score.wav"}]

    def create_space(self, name, description):
        self.created.append(("space", name, description))
        return {"id": 5, "name": name}

    def create_folder(self, space_id, name, parent_id):
        self.created.append(("folder", space_id, name, parent_id))
        return {"id": 10, "space_id": space_id, "name": name}

    def create_audiovisual_project(self, space_id, name, description, folder_id):
        self.created.append(("project", space_id, name, description, folder_id))
        return {"id": 13, "space_id": space_id, "name": name}


class SpaceServiceTests(unittest.TestCase):
    def setUp(self):
        self.records = FakeSpaceRecords()
        self.service = SpaceService(self.records)

    def test_overview_groups_files_folders_and_typed_projects(self):
        overview = self.service.overview(4)
        self.assertEqual(overview["space"]["name"], "Hudson")
        self.assertEqual(overview["folders"][0]["space_id"], 4)
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
            self.service.create_space("  ")
        with self.assertRaises(DomainValidation):
            self.service.create_folder(4, "  ")


if __name__ == "__main__":
    unittest.main()
