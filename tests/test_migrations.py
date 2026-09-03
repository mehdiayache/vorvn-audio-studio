"""Fresh-database verification for the canonical Origins schema."""

from dataclasses import replace
from pathlib import Path
import unittest
from uuid import uuid4

import psycopg
from psycopg import sql

from origins.config import settings
from origins import migrations


class MigrationTests(unittest.TestCase):
    def test_empty_database_bootstraps_idempotently_to_origins(self):
        database_name = f"origins_test_{uuid4().hex[:12]}"
        admin_url = settings.database_url.rsplit("/", 1)[0] + "/postgres"
        test_url = settings.database_url.rsplit("/", 1)[0] + f"/{database_name}"
        with psycopg.connect(admin_url, autocommit=True) as admin:
            admin.execute(sql.SQL("CREATE DATABASE {}").format(
                sql.Identifier(database_name)))
        original = migrations.settings
        try:
            migrations.settings = replace(settings, database_url=test_url)
            expected = sorted(
                path.name for path in Path(migrations.__file__).parent.glob(
                    "*.sql")
            )
            self.assertEqual(migrations.run(), expected)
            self.assertEqual(migrations.run(), [])
            with psycopg.connect(test_url) as database:
                tables = {row[0] for row in database.execute("""
                    SELECT table_name FROM information_schema.tables
                     WHERE table_schema = 'public'
                """).fetchall()}
                self.assertTrue({
                    "workspaces", "folders", "projects", "productions", "production_parts",
                    "files", "file_versions", "production_file_usages",
                    "objects", "object_file_usages", "jobs", "job_events",
                    "sound_scenes", "sound_scene_history", "visual_scenes",
                    "exports", "creator_working_drafts",
                    "saved_visual_references", "saved_visual_reference_files",
                    "schema_migrations",
                }.issubset(tables))
                self.assertTrue({
                    "spaces", "ventures", "series",
                    "project_parts", "project_file_usages", "assets", "asset_versions",
                    "file_collections", "production_files",
                }.isdisjoint(tables))
                file_columns = {row[0] for row in database.execute("""
                    SELECT column_name FROM information_schema.columns
                     WHERE table_name='files'
                """).fetchall()}
                self.assertTrue({"workspace_id", "folder_id", "source"}.issubset(
                    file_columns))
                self.assertNotIn("scope", file_columns)
                self.assertNotIn("source_generation_id", file_columns)
                production_columns = {row[0] for row in database.execute("""
                    SELECT column_name FROM information_schema.columns
                     WHERE table_name='productions'
                """).fetchall()}
                self.assertTrue({
                    "workspace_id", "folder_id", "project_id", "production_type"
                }.issubset(production_columns))
                for table in ("production_parts", "clips", "transcripts",
                              "jobs", "exports"):
                    columns = {row[0] for row in database.execute("""
                        SELECT column_name FROM information_schema.columns
                         WHERE table_name=%s
                    """, (table,)).fetchall()}
                    self.assertNotIn("legacy_generation_id", columns, table)
        finally:
            migrations.settings = original
            with psycopg.connect(admin_url, autocommit=True) as admin:
                admin.execute("""
                    SELECT pg_terminate_backend(pid) FROM pg_stat_activity
                     WHERE datname = %s AND pid <> pg_backend_pid()
                """, (database_name,))
                admin.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(
                    sql.Identifier(database_name)))


if __name__ == "__main__":
    unittest.main()
