"""Transactional Persona/Cast/Part revision integration checks."""

import unittest
from uuid import uuid4

import psycopg

from audio_studio.config import settings
from audio_studio.infrastructure.postgres.casting import CastRepository
from audio_studio.infrastructure.postgres.production_document import ProductionDocumentRepository
from audio_studio.infrastructure.postgres.speech import SpeechRepository
from audio_studio.composition.work import work_service


class CastingTests(unittest.TestCase):
    def test_recast_revises_every_part_and_never_rewrites_takes(self):
        marker = uuid4().hex[:10]
        venture = work_service.create("ventures", None, f"Cast {marker}")
        project = work_service.create("projects", venture["id"], f"Project {marker}")
        production = work_service.create("productions", project["id"], f"Episode {marker}")
        self.assertEqual(
            work_service.resource("productions", str(production["public_id"]))["id"],
            production["id"],
        )
        self.assertEqual(
            work_service.production_editor(str(production["public_id"]))["id"],
            production["id"],
        )
        identity_a, identity_b = f"voice_{marker}_a", f"voice_{marker}_b"
        documents = ProductionDocumentRepository()
        casting = CastRepository()
        try:
            with psycopg.connect(settings.database_url) as database:
                with database.cursor() as cursor:
                    cursor.execute("INSERT INTO voice_identities(id,name) VALUES(%s,'Sarah'),(%s,'Maya')",
                                   (identity_a, identity_b))
                database.commit()
            persona = casting.create_persona(str(venture["public_id"]), {
                "name": "Paul", "description": "A curious child"})
            role = casting.create_role(str(production["public_id"]), {
                "name": "Paul", "persona_id": persona["id"],
                "voice_source_kind": "identity", "voice_identity_id": identity_a})
            part_id = documents.create_part(int(production["id"]), {
                "kind": "draft", "text": "Paul opened the door."})
            with psycopg.connect(settings.database_url) as database:
                with database.cursor() as cursor:
                    cursor.execute("SELECT id FROM production_cast_roles WHERE public_id=%s",
                                   (role["id"],))
                    internal_role = cursor.fetchone()[0]
                    cursor.execute("UPDATE production_parts SET cast_role_id=%s WHERE id=%s",
                                   (internal_role, part_id))
                    cursor.execute("""
                        INSERT INTO takes
                            (part_id,source_part_revision,source_script_hash,
                             cast_role_id,cast_role_name_snapshot,
                             voice_identity_id,voice_name_snapshot,filename,path)
                        VALUES(%s,1,'hash-v1',%s,'Paul',%s,'Sarah','','')
                    """, (part_id, internal_role, identity_a))
                database.commit()
            changed = casting.recast(role["id"], {
                "voice_source_kind": "identity", "voice_identity_id": identity_b,
                "catalogue_voice_id": None})
            self.assertEqual(changed["parts_revised"], 1)
            self.assertEqual(changed["assignment_revision"], 2)
            speech = SpeechRepository()
            with self.assertRaisesRegex(ValueError, "does not belong"):
                speech.cast_assignment(
                    int(production["id"]), role["id"],
                    voice_identity_id=identity_a, catalogue_voice_id=None)
            late_part = speech.create_part(
                int(production["id"]), None, {
                    "text": "Generated while the Cast changed.",
                    "cast_role_id": role["id"],
                    "_cast_snapshot": {
                        "assignment_revision": 1,
                        "cast_role_name": "Paul",
                        "persona_name": "Paul",
                    },
                    "voice_identity_id": identity_a,
                    "voice_name": "Sarah", "provider_voice_id": "fixture",
                    "provider": "alibaba", "provider_region": "intl",
                    "model_id": "fixture", "tier": "flash",
                    "capability_id": "expressive_tags",
                    "capability_name": "Expressive + tags",
                    "format": "mp3", "filename": "", "path": "",
                })
            with psycopg.connect(settings.database_url) as database:
                with database.cursor() as cursor:
                    cursor.execute("SELECT revision FROM production_parts WHERE id=%s", (part_id,))
                    self.assertEqual(cursor.fetchone()[0], 2)
                    cursor.execute("SELECT voice_name_snapshot,source_part_revision FROM takes WHERE part_id=%s",
                                   (part_id,))
                    self.assertEqual(cursor.fetchone(), ("Sarah", 1))
                    cursor.execute("""
                        SELECT part.revision,part.selected_take_id,
                               take.cast_assignment_revision,
                               take.voice_identity_id
                          FROM production_parts part
                          JOIN takes take ON take.part_id=part.id
                         WHERE part.id=%s
                    """, (late_part,))
                    self.assertEqual(
                        cursor.fetchone(), (2, None, 1, identity_a))
        finally:
            with psycopg.connect(settings.database_url) as database:
                with database.cursor() as cursor:
                    cursor.execute("DELETE FROM ventures WHERE id=%s", (venture["id"],))
                    cursor.execute("DELETE FROM projects WHERE id IN (%s,%s,%s)",
                                   (venture["id"], project["id"], production["id"]))
                    cursor.execute("DELETE FROM voice_identities WHERE id IN (%s,%s)",
                                   (identity_a, identity_b))
                database.commit()


if __name__ == "__main__":
    unittest.main()
