import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "audio_studio" / "migrations" / "054_space_create_core.sql"
BRIDGE_MIGRATION = ROOT / "audio_studio" / "migrations" / "055_space_legacy_bridge.sql"
WRITE_BRIDGE_MIGRATION = ROOT / "audio_studio" / "migrations" / "056_space_legacy_writes.sql"


class SpaceCreateMigrationContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text()

    def test_workspace_is_not_persisted(self):
        self.assertNotIn("CREATE TABLE IF NOT EXISTS workspaces", self.sql)
        self.assertIn("CREATE TABLE IF NOT EXISTS spaces", self.sql)

    def test_create_core_keeps_direct_project_creation_outside_jobs(self):
        self.assertIn("ALTER TABLE productions", self.sql)
        self.assertIn("project_type", self.sql)
        self.assertNotIn("creation_action_id TEXT NOT NULL", self.sql)

    def test_file_contract_is_open_and_versioned(self):
        self.assertIn("DROP CONSTRAINT IF EXISTS assets_media_type_check", self.sql)
        self.assertIn("ALTER TABLE asset_versions", self.sql)
        self.assertIn("storage_key", self.sql)
        self.assertIn("mime_type SET NOT NULL", self.sql)

    def test_project_association_is_separate_from_timeline_placement(self):
        self.assertIn("CREATE TABLE IF NOT EXISTS project_files", self.sql)
        self.assertNotIn("timeline", self.sql.lower())

    def test_existing_jobs_are_extended_in_place(self):
        self.assertIn("ALTER TABLE jobs", self.sql)
        self.assertIn("creation_action_id", self.sql)
        self.assertIn("creation_preset_id", self.sql)
        self.assertIn("output_file_ids", self.sql)
        self.assertNotIn("CREATE TABLE IF NOT EXISTS action_execution_jobs", self.sql)

    def test_temporary_legacy_writer_preserves_required_space_ownership(self):
        bridge = BRIDGE_MIGRATION.read_text()
        write_bridge = WRITE_BRIDGE_MIGRATION.read_text()
        self.assertIn("BEFORE INSERT OR UPDATE OF project_id, space_id", bridge)
        self.assertIn("work_project.venture_id", bridge)
        self.assertIn("AFTER INSERT OR UPDATE OF name, description ON ventures", write_bridge)
        self.assertIn("BEFORE INSERT OR UPDATE OF venture_id, space_id ON assets", write_bridge)
        self.assertNotIn("DROP NOT NULL", bridge + write_bridge)


if __name__ == "__main__":
    unittest.main()
