"""Timeline orchestration tests without files or PostgreSQL."""

import unittest

from origins.application.timeline import TimelineError, TimelineService


class Records:
    def __init__(self):
        self.parts = {7: {"id": 7, "kind": "audio", "filename": "part.mp3", "revision": 3}}
        self.files = {}
        self.created = []
        self.inserted_assets = []
        self.replaced_assets = []
        self.duplicated = []
        self.enabled_values = []
        self.allow_asset = True
        self.duplicate_id = 8
        self.deleted = []
        self.editorial_values = []

    @staticmethod
    def production(production_id):
        return {"id": production_id} if production_id in {6, 9} else None

    def part(self, production_id, part_id):
        return self.parts.get(part_id) if production_id == 6 else None

    @staticmethod
    def reorder(_production_id, _order):
        return True

    def set_enabled(self, production_id, part_id, enabled):
        self.enabled_values.append((production_id, part_id, enabled))
        return True

    def create_part(self, production_id, values,
                    before_part_public_id=None):
        self.created.append((production_id, values, before_part_public_id))
        return 101

    def file(self, file_id):
        return self.files.get(file_id)

    def file_allowed(self, _production_id, _file_id):
        return self.allow_asset

    def insert_file(self, production_id, file_id,
                     before_part_public_id=None):
        self.inserted_assets.append(
            (production_id, file_id, before_part_public_id))
        return 102

    def replace_file(self, production_id, part_id, file_id):
        self.replaced_assets.append((production_id, part_id, file_id))
        return True

    def duplicate(self, production_id, part_id, filename):
        self.duplicated.append((production_id, part_id, filename))
        return self.duplicate_id

    def delete(self, production_id, ids):
        self.deleted.append((production_id, ids))
        return ["part.mp3"]

    @staticmethod
    def move(_source, _ids, _destination):
        return True

    @staticmethod
    def save_script(_production_id, _part_id, _script, _values=None):
        return True

    def save_editorial(self, _production_id, _part_id, expected_revision, values):
        self.editorial_values.append(values)
        if expected_revision != 3:
            return {"status": "conflict", "revision": 3}
        return {"status": "ok", "changed": True, "revision": 4,
                "outdated": True, "values": values}

    @staticmethod
    def save_draft(_production_id, _part_id, _values):
        return True


class Workspace:
    def __init__(self):
        self.discarded = []

    @staticmethod
    def duplicate(_filename):
        return "part-copy.mp3"

    def discard(self, filename):
        self.discarded.append(filename)


class Transcripts:
    def __init__(self):
        self.stale = []

    def mark_stale(self, part_id):
        self.stale.append(part_id)
        return 2

    @staticmethod
    def list_for_part(part_id):
        return [{"part_id": part_id}]


class TimelineServiceTests(unittest.TestCase):
    def setUp(self):
        self.records = Records()
        self.workspace = Workspace()
        self.transcripts = Transcripts()
        self.service = TimelineService(
            self.records, self.workspace, self.transcripts)

    def test_missing_production_and_part_fail_before_mutation(self):
        with self.assertRaisesRegex(TimelineError, "Production"):
            self.service.add_silence(404, 2)
        with self.assertRaisesRegex(TimelineError, "Part"):
            self.service.duplicate(6, 404)
        self.assertFalse(self.records.duplicated)

    def test_silence_is_clamped_and_saved_with_exact_free_contract(self):
        result = self.service.add_silence(6, 500)
        _, values, before_part_id = self.records.created[0]
        self.assertEqual(result, {"id": 101, "seconds": 120.0})
        self.assertEqual((values["kind"], values["duration_ms"]),
                         ("silence", 120_000))
        self.assertIsNone(before_part_id)
        self.assertEqual(values["cost_basis"], "not billed")

    def test_part_inclusion_is_durable_without_deleting_the_part(self):
        self.assertEqual(
            self.service.set_enabled(6, 7, False),
            {"ok": True, "enabled": False},
        )
        self.assertEqual(self.records.enabled_values, [(6, 7, False)])
        self.assertIn(7, self.records.parts)

    def test_draft_preserves_creator_settings_without_provider_work(self):
        self.service.add_draft(6, {
            "text": "  Rest now  ", "voice": "custom:serenity",
            "authored_role": "  Night   Guide  ",
            "spoken_profile": "spoken_2", "enable_ssml": True,
            "voice_identity_id": "voice-1", "engine": "audio",
            "model": "flash",
            "insert_before_part_id": "part-before",
        })
        _, values, before_part_id = self.records.created[0]
        self.assertEqual((values["text"], values["authored_role"],
                          values["spoken_profile"], values["enable_ssml"],
                          values["voice_identity_id"], values["kind"],
                          before_part_id),
                         ("Rest now", "Night Guide", "spoken_2", True,
                          "voice-1", "draft", "part-before"))

    def test_file_classification_does_not_restrict_sequence_placement(self):
        self.records.files[55] = {"filename": "music.mp3", "kind": "music"}
        self.assertEqual(self.service.insert_file(6, 55), {"id": 102})

    def test_visual_assets_cannot_leak_into_audio_only_script_parts(self):
        self.records.files[55] = {
            "filename": "story-frame.png", "media_type": "image",
        }
        with self.assertRaisesRegex(TimelineError, "Only audio Files"):
            self.service.insert_file(6, 55)
        self.assertFalse(self.records.inserted_assets)

    def test_public_part_anchor_is_the_stable_insertion_contract(self):
        self.service.add_silence(6, 2, "part-before")
        self.assertEqual(self.records.created[0][2], "part-before")
        self.records.files[55] = {
            "filename": "intro.mp3", "context": {"collection": "Intros"}}
        self.service.insert_file(6, 55, "part-before")
        self.assertEqual(self.records.inserted_assets,
                         [(6, 55, "part-before")])

    def test_file_replacement_keeps_the_part_identity(self):
        self.records.parts[7]["kind"] = "file"
        self.records.files[55] = {"filename": "outro.mp3"}
        self.assertEqual(self.service.replace_file(6, 7, 55), {"id": 7})
        self.assertEqual(self.records.replaced_assets, [(6, 7, 55)])
        self.records.parts[7]["kind"] = "speech"
        with self.assertRaisesRegex(TimelineError, "not linked to a Workspace File"):
            self.service.replace_file(6, 7, 55)

    def test_duplicate_database_failure_discards_new_file(self):
        self.records.duplicate_id = None
        with self.assertRaisesRegex(TimelineError, "could not be duplicated"):
            self.service.duplicate(6, 7)
        self.assertEqual(self.workspace.discarded, ["part-copy.mp3"])

    def test_delete_part_discards_its_owned_audio(self):
        self.assertEqual(
            self.service.delete_parts(6, [7]),
            {"deleted": 1},
        )
        self.assertEqual(self.records.deleted, [(6, [7])])
        self.assertEqual(self.workspace.discarded, ["part.mp3"])

    def test_captions_share_injected_transcript_state(self):
        self.assertEqual(self.service.captions(6, 7), [{"part_id": 7}])

    def test_editorial_update_is_revision_guarded(self):
        changed = self.service.save_editorial(
            6, 7, 3, {"script": "New canonical words"})
        self.assertEqual(changed, {"ok": True, "changed": True,
                                  "revision": 4, "outdated": True})
        with self.assertRaisesRegex(Exception, "changed in another view"):
            self.service.save_editorial(
                6, 7, 2, {"script": "Stale edit"})

    def test_authored_role_is_trimmed_without_creating_a_cast(self):
        changed = self.service.save_editorial(
            6, 7, 3, {"authored_role": "  Narrator  "})
        self.assertEqual(changed["changed"], True)
        self.assertEqual(self.records.editorial_values[-1],
                         {"authored_role": "Narrator"})


if __name__ == "__main__":
    unittest.main()
