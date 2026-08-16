"""Canonical provider catalogue checks; no remote provider calls."""

import unittest
from uuid import uuid4

import psycopg

from audio_studio.config import settings
from audio_studio.domain import provider_catalog, voice_registry
from audio_studio.infrastructure.postgres.provider_catalogue import (
    ProviderCatalogueRepository,
)
from audio_studio.infrastructure.postgres.speech import SpeechRepository


class ProviderCatalogueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            raise unittest.SkipTest(str(error)) from error
        connection.close()

    def test_refresh_is_canonical_and_not_a_business_attempt(self):
        repository = ProviderCatalogueRepository()
        with psycopg.connect(settings.database_url) as database:
            before = database.execute(
                "SELECT count(*) FROM provider_attempts").fetchone()[0]
        expected = voice_registry.system_bindings()
        self.assertEqual(repository.refresh_documented_snapshot(), len(expected))
        persisted = repository.bindings()
        self.assertEqual(
            {item["catalogue_voice_id"] for item in persisted},
            {item["catalogue_voice_id"] for item in expected},
        )
        self.assertEqual(
            {item["catalogue_voice_id"] for item in SpeechRepository().catalogue_voices()},
            {item["catalogue_voice_id"] for item in persisted},
        )
        expressive = next(
            capability
            for item in persisted if item["engine"] == "audio"
            for capability in item["capabilities"]
            if capability["id"] == "expressive_tags")
        self.assertTrue(expressive["controls"]["delivery_tags"])
        self.assertTrue(expressive["controls"]["rate"])
        self.assertEqual(
            expressive["ui_metadata"]["direction_label"], "Voice direction")
        audio_route = next(item for item in persisted
                           if item["engine"] == "audio"
                           and item["tier"] == "flash")
        self.assertEqual(audio_route["estimate_rate_per_million_chars"], 15.0)
        male_voice = next(item for item in persisted
                          if item["provider_voice_id"] == "longchuanshu_v3.6")
        self.assertEqual(male_voice["gender"], "male")
        audio_method = next(
            item for item in repository.enrollment_methods()
            if item["provider_model_id"]
            == "alibaba:intl:qwen-audio-3.0-tts-flash")
        self.assertEqual(
            audio_method["output_languages"],
            list(provider_catalog.AUDIO_CLONE_LANGUAGES.values()),
        )
        with psycopg.connect(settings.database_url) as database:
            after = database.execute(
                "SELECT count(*) FROM provider_attempts").fetchone()[0]
        self.assertEqual(after, before)

    def test_installed_enrollment_methods_come_from_provider_models(self):
        repository = ProviderCatalogueRepository()
        marker = uuid4().hex[:10]
        provider_model_id = f"fixture:global:model-{marker}"
        try:
            with psycopg.connect(settings.database_url) as database:
                database.execute("""
                    INSERT INTO provider_models
                        (id,provider,region,model_id,tier,operation,
                         enrollment_languages,output_languages,pricing,status,
                         metadata,adapter_key,enrollment_supported)
                    VALUES (%s,'fixture','global',%s,'plus','voice_clone',
                            '["en"]','["English","Arabic"]',
                            '{"enrollment_cost_usd":0.25}','active',
                            '{"model_label":"Fixture Voice Model"}',
                            'fixture-adapter',true)
                """, (provider_model_id, f"model-{marker}"))
                database.execute("""
                    INSERT INTO provider_model_capabilities
                        (provider_model_id,capability_id)
                    VALUES (%s,'expressive_tags')
                """, (provider_model_id,))
                database.commit()
            method = next(item for item in repository.enrollment_methods()
                          if item["provider_model_id"] == provider_model_id)
            self.assertEqual(method["provider"], "fixture")
            self.assertEqual(method["adapter_key"], "fixture-adapter")
            self.assertEqual(method["label"], "Fixture Voice Model")
            self.assertEqual(method["capability_ids"], ["expressive_tags"])
            self.assertEqual(method["estimated_creation_cost"], .25)
        finally:
            with psycopg.connect(settings.database_url) as database:
                database.execute("DELETE FROM provider_models WHERE id=%s",
                                 (provider_model_id,))
                database.commit()


if __name__ == "__main__":
    unittest.main()
