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
        provider_id = f"qwen-omni-vc-repo-{marker}"
        model_id = f"fixture-model-{marker}"
        reference_id = f"ref_repo_{marker}"
        metadata_id = f"qwen-audio-3.0-tts-plus-repo-{marker}"
        generation_id = None
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
                        INSERT INTO voice_bindings
                            (provider_voice_id, model_id, identity_id, engine,
                             tier, languages, reference_id)
                        VALUES (%s, %s, %s, 'omni', 'plus', '["English"]'::jsonb,
                                %s)
                    """, (provider_id, model_id, identity_id, reference_id))
                    cursor.execute("""
                        INSERT INTO voices (id, image, favourite, name)
                        VALUES (%s, 'fixture.png', true, 'Fixture system voice')
                    """, (metadata_id,))
                    cursor.execute("""
                        INSERT INTO generations
                            (text, voice, model, format, filename, path,
                             voice_identity_id, cost)
                        VALUES ('Fixture', %s, %s, 'mp3', 'fixture.mp3',
                                'fixture.mp3', NULL, 0.25)
                        RETURNING id
                    """, (provider_id, model_id))
                    generation_id = int(cursor.fetchone()[0])
                database.commit()

            profile = next(item for item in repository.profiles()
                           if item["id"] == identity_id)
            self.assertEqual(profile["references"][0]["id"], reference_id)
            self.assertEqual(profile["bindings"][0]["provider_voice_id"],
                             provider_id)
            self.assertEqual(repository.profile_usage()[identity_id]["uses"], 1)
            binding = next(
                item for item in repository.custom_bindings()
                if item["voice_id"] == provider_id)
            self.assertTrue(binding.keys() >= {
                "voice_id", "identity_id", "target_model"})
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
                        SELECT voice_identity_id FROM generations WHERE id = %s
                    """, (generation_id,))
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
                    if generation_id:
                        cursor.execute(
                            "DELETE FROM generations WHERE id = %s",
                            (generation_id,))
                    cursor.execute("DELETE FROM voice_bindings WHERE identity_id = %s",
                                   (identity_id,))
                    cursor.execute("DELETE FROM voice_references WHERE id = %s",
                                   (reference_id,))
                    cursor.execute("DELETE FROM voice_identities WHERE id = %s",
                                   (identity_id,))
                    cursor.execute("DELETE FROM voices WHERE id = %s",
                                   (metadata_id,))
                database.commit()


if __name__ == "__main__":
    unittest.main()
