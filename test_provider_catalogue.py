"""Canonical provider catalogue checks; no remote provider calls."""

import unittest
from uuid import uuid4

import psycopg

from audio_studio.composition.work import work_service
from audio_studio.config import settings
from audio_studio.domain import voice_registry
from audio_studio.infrastructure.postgres.casting import CastRepository
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
        with psycopg.connect(settings.database_url) as database:
            after = database.execute(
                "SELECT count(*) FROM provider_attempts").fetchone()[0]
        self.assertEqual(after, before)

    def test_catalogue_cast_accepts_only_a_persisted_exact_route(self):
        repository = ProviderCatalogueRepository()
        repository.refresh_documented_snapshot()
        route = repository.bindings()[0]
        marker = uuid4().hex[:10]
        venture = work_service.create("ventures", None, f"Catalogue {marker}")
        project = work_service.create("projects", venture["id"], f"Project {marker}")
        production = work_service.create(
            "productions", project["id"], f"Episode {marker}")
        casting = CastRepository()
        try:
            role = casting.create_role(str(production["public_id"]), {
                "name": "Narrator", "voice_source_kind": "catalogue",
                "voice_identity_id": None,
                "catalogue_voice_id": route["catalogue_voice_id"],
            })
            self.assertEqual(
                role["catalogue_voice_id"], route["catalogue_voice_id"])
            with self.assertRaisesRegex(ValueError, "unavailable"):
                casting.create_role(str(production["public_id"]), {
                    "name": "Invalid", "voice_source_kind": "catalogue",
                    "voice_identity_id": None,
                    "catalogue_voice_id": "alibaba:intl:missing:missing",
                })
        finally:
            with psycopg.connect(settings.database_url) as database:
                database.execute("DELETE FROM ventures WHERE id=%s", (venture["id"],))
                database.execute("DELETE FROM projects WHERE id IN (%s,%s,%s)",
                                 (venture["id"], project["id"], production["id"]))
                database.commit()


if __name__ == "__main__":
    unittest.main()
