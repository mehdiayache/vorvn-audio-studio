"""Fresh-database verification for the single versioned migration system."""

from __future__ import annotations

from dataclasses import replace
import unittest
from uuid import uuid4

import psycopg
from psycopg import sql

from audio_studio.config import settings
from audio_studio import migrations


class MigrationTests(unittest.TestCase):
    def test_empty_database_bootstraps_idempotently_without_legacy_code(self):
        database_name = f"audio_studio_test_{uuid4().hex[:12]}"
        admin_url = settings.database_url.rsplit("/", 1)[0] + "/postgres"
        test_url = settings.database_url.rsplit("/", 1)[0] + f"/{database_name}"
        with psycopg.connect(admin_url, autocommit=True) as admin:
            admin.execute(sql.SQL("CREATE DATABASE {}").format(
                sql.Identifier(database_name)))
        original = migrations.settings
        try:
            migrations.settings = replace(settings, database_url=test_url)
            self.assertEqual(migrations.run(), [
                "000_base_schema.sql", "000a_prepare_pronunciation.sql",
                "001_durable_jobs.sql",
                "002_job_payloads.sql", "003_control_plane.sql",
                "004_pronunciation_phoneme_boolean.sql",
                "005_worker_runtime.sql",
                "006_job_idempotency.sql",
                "007_voice_provenance.sql",
            "008_voice_output_languages.sql",
            "009_speak_recording_sessions.sql",
            "010_voice_editorial_language.sql",
            "011_voice_architecture.sql",
            "012_exact_media_relations.sql",
            "013_retire_generation_identity.sql",
                    "014_provider_model_pricing.sql",
                    "015_voice_reference_objects.sql",
                    "016_enrollment_campaign_controls.sql",
                    "017_provider_model_execution_contract.sql",
                    "018_provider_attempt_reconciliation.sql",
                    "019_exact_enrollment_routes.sql",
                    "020_provider_model_catalogue_truth.sql",
                    "021_composer_working_drafts.sql",
                    "022_capability_composer_controls.sql",
                    "023_exact_route_speech_pricing.sql",
                    "024_safe_series_defaults.sql",
                    "025_archived_part_positions.sql",
                    "026_reconcile_archived_part_positions.sql",
                    "027_one_recording_per_part.sql",
                    "028_part_enabled_state.sql",
                    "029_remove_casting.sql",
                    "030_remove_cast_draft_state.sql",
                    "031_remove_enrollment_campaigns.sql",
                    "032_replace_takes_with_clips.sql",
                    "033_remove_take_job_payloads.sql",
                    "034_simplify_speech_contracts.sql",
                    "035_authored_part_roles.sql",
                    "036_remove_qwen35_omni.sql",
                    "037_cosyvoice_v3_plus.sql",
                    "038_provider_word_captions.sql",
                    "039_sound_scenes.sql",
                    "040_sound_scene_public_anchors.sql",
                    "041_audio_library_truth.sql",
                    "042_auvi_studio_identity.sql",
                    "043_voice_source_windows_and_previews.sql",
        ])
            self.assertEqual(migrations.run(), [])
            with psycopg.connect(test_url) as database:
                tables = {row[0] for row in database.execute("""
                    SELECT table_name FROM information_schema.tables
                     WHERE table_schema = 'public'
                """).fetchall()}
                self.assertTrue({
                    "ventures", "work_projects", "series", "productions",
                    "production_parts", "sound_scenes",
                    "sound_scene_history", "assets",
                    "asset_versions", "exports", "jobs", "job_events",
                    "audit_records", "transcripts", "schema_migrations",
                    "composer_working_drafts",
                    "voice_reference_windows", "voice_previews",
                }.issubset(tables))
                self.assertNotIn("production_mixes", tables)
                self.assertTrue({
                    "enrollment_campaigns", "enrollment_campaign_items",
                }.isdisjoint(tables))
                fixtures = dict(database.execute("""
                    SELECT system_role, count(*) FROM projects
                     WHERE system_role IN ('inbox', 'sandbox')
                     GROUP BY system_role
                """).fetchall())
                self.assertEqual(fixtures, {"inbox": 1, "sandbox": 1})
                self.assertEqual(database.execute("""
                    SELECT count(*) FROM asset_collections collection
                    JOIN ventures venture ON venture.id = collection.venture_id
                    WHERE venture.system_role = 'sandbox'
                """).fetchone()[0], 4)
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
