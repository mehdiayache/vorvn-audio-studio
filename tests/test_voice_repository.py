"""Native Voice repository contracts. No provider calls."""

from __future__ import annotations

import unittest
from uuid import uuid4

import psycopg

from audio_studio.config import settings
from audio_studio.infrastructure.postgres.voices import VoiceRepository, voice_key


class VoiceRepositoryTests(unittest.TestCase):
    def test_provider_tiers_share_one_catalogue_key(self):
        self.assertEqual(
            voice_key("qwen-audio-3.0-tts-plus-Sarah"), "Sarah")
        self.assertEqual(
            voice_key("qwen-audio-3.0-tts-flash-Sarah"), "Sarah")
        self.assertEqual(voice_key("Tina"), "Tina")

    def test_profile_catalogue_and_history_lifecycle(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            self.skipTest(str(error))
        connection.close()

        repository = VoiceRepository()
        marker = uuid4().hex
        identity_id = f"voice_repo_{marker}"
        provider_id = f"qwen-audio-3.0-tts-flash-repo-{marker}"
        model_id = f"fixture-model-{marker}"
        reference_id = f"ref_repo_{marker}"
        second_reference_id = f"ref_repo_second_{marker}"
        second_provider_id = f"qwen-audio-3.0-tts-flash-repo-second-{marker}"
        metadata_id = f"qwen-audio-3.0-tts-plus-repo-{marker}"
        part_id = None
        try:
            with psycopg.connect(settings.database_url) as database:
                with database.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO voice_identities
                            (id, name, metadata, recording_language)
                        VALUES (%s, %s, '{"language":"en"}'::jsonb, 'en')
                    """, (identity_id, f"Repository {marker[:8]}"))
                    cursor.execute("""
                        INSERT INTO voice_references
                            (id, identity_id, original_name, original_path,
                             normalized_path)
                        VALUES (%s, %s, 'source.mp3', 'source.mp3', 'source.wav')
                    """, (reference_id, identity_id))
                    cursor.execute("""
                        INSERT INTO voice_references
                            (id, identity_id, original_name, original_path,
                             normalized_path)
                        VALUES (%s, %s, 'studio.mp3', 'studio.mp3', 'studio.wav')
                    """, (second_reference_id, identity_id))
                    cursor.execute("""
                        UPDATE voice_identities SET preferred_reference_id=%s
                         WHERE id=%s
                    """, (reference_id, identity_id))
                    cursor.execute("""
                        INSERT INTO voice_bindings
                            (provider_voice_id, model_id, identity_id, engine,
                             tier, languages, reference_id)
                        VALUES (%s, %s, %s, 'audio', 'flash', '["English"]'::jsonb,
                                %s)
                        RETURNING id
                    """, (provider_id, model_id, identity_id, reference_id))
                    binding_id = cursor.fetchone()[0]
                    cursor.execute("""
                        INSERT INTO voice_bindings
                            (provider_voice_id, model_id, identity_id, engine,
                             tier, languages, reference_id)
                        VALUES (%s, %s, %s, 'audio', 'flash', '["English"]'::jsonb,
                                %s)
                    """, (second_provider_id, model_id, identity_id,
                          second_reference_id))
                    cursor.execute("""
                        INSERT INTO voices (id, image, favourite, name)
                        VALUES (%s, 'fixture.png', true, 'Fixture system voice')
                    """, (metadata_id,))
                    cursor.execute("SELECT id FROM productions ORDER BY id LIMIT 1")
                    production = cursor.fetchone()
                    if not production:
                        self.skipTest("No Production exists for canonical Clip fixture")
                    cursor.execute("""
                        INSERT INTO production_parts
                            (production_id, position, kind, script)
                        VALUES (%s, (SELECT coalesce(max(position),-1)+1
                                      FROM production_parts WHERE production_id=%s),
                                'speech', 'Fixture') RETURNING id
                    """, (production[0], production[0]))
                    part_id = int(cursor.fetchone()[0])
                    cursor.execute("""
                        INSERT INTO clips
                            (part_id, source_part_revision, source_script_hash,
                             binding_id, binding_resolution_status,
                             provider_voice_id, model_id, cost, filename, path)
                        VALUES (%s,1,'fixture',%s,'unresolved',%s,%s,0.25,
                                'fixture.mp3','fixture.mp3')
                    """, (part_id, binding_id, provider_id, model_id))
                database.commit()

            profile = next(item for item in repository.profiles()
                           if item["id"] == identity_id)
            self.assertEqual(
                {item["id"] for item in profile["references"]},
                {reference_id, second_reference_id},
            )
            self.assertEqual(profile["preferred_reference_id"], reference_id)
            exact_bindings = [item for item in profile["bindings"]
                              if item["model_id"] == model_id]
            self.assertEqual(len(exact_bindings), 2)
            self.assertEqual(
                {item["reference_id"] for item in exact_bindings},
                {reference_id, second_reference_id})
            self.assertEqual(len({item["binding_id"]
                                  for item in exact_bindings}), 2)
            self.assertEqual(repository.profile_usage()[identity_id]["uses"], 1)
            binding = next(
                item for item in repository.custom_bindings()
                if item["voice_id"] == provider_id)
            self.assertTrue(binding.keys() >= {
                "voice_id", "identity_id", "target_model",
                "provider_voice_id", "model_id", "provider", "region",
                "adapter_key", "capabilities",
                "estimate_rate_per_million_chars"})
            self.assertEqual(
                repository.binding_references()[provider_id]["id"], reference_id)

            metadata = repository.catalog_metadata()
            self.assertEqual(metadata[voice_key(metadata_id)]["image"], "fixture.png")
            self.assertEqual(repository.catalog_usage()[voice_key(provider_id)]["uses"], 1)
            self.assertTrue(any(
                item["provider_voice_id"] == provider_id
                for item in repository.unlinked_history()))

            self.assertTrue(repository.update_profile(
                identity_id, {"name": "Updated repository voice", "age": 32}))
            updated = next(item for item in repository.profiles()
                           if item["id"] == identity_id)
            self.assertEqual((updated["name"], updated["metadata"]["age"]),
                             ("Updated repository voice", 32))

            self.assertEqual(repository.link_history(provider_id, identity_id), 1)
            self.assertFalse(any(
                item["provider_voice_id"] == provider_id
                for item in repository.unlinked_history()))
            with psycopg.connect(settings.database_url) as database:
                with database.cursor() as cursor:
                    cursor.execute("""
                        SELECT voice_identity_id FROM clips WHERE part_id = %s
                    """, (part_id,))
                    self.assertEqual(cursor.fetchone()[0], identity_id)
                    cursor.execute("""
                        SELECT count(*) FROM jobs
                         WHERE kind = 'voice_history_link'
                           AND voice_identity_id = %s
                    """, (identity_id,))
                    self.assertEqual(cursor.fetchone()[0], 1)
        finally:
            with psycopg.connect(settings.database_url) as database:
                with database.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM jobs WHERE voice_identity_id = %s",
                        (identity_id,))
                    if part_id:
                        cursor.execute("DELETE FROM production_parts WHERE id = %s",
                                       (part_id,))
                    cursor.execute("DELETE FROM voice_bindings WHERE identity_id = %s",
                                   (identity_id,))
                    cursor.execute("DELETE FROM voice_references WHERE id=ANY(%s)",
                                   ([reference_id, second_reference_id],))
                    cursor.execute("DELETE FROM voice_identities WHERE id = %s",
                                   (identity_id,))
                    cursor.execute("DELETE FROM voices WHERE id = %s",
                                   (metadata_id,))
                database.commit()


if __name__ == "__main__":
    unittest.main()
