"""Timeline orchestration tests without files or PostgreSQL."""

import unittest

from audio_studio.application.timeline import TimelineError, TimelineService


class Records:
    def __init__(self):
        self.parts = {7: {"id": 7, "kind": "audio", "filename": "part.mp3", "revision": 3}}
        self.assets = {}
        self.created = []
        self.inserted_assets = []
        self.replaced_assets = []
        self.duplicated = []
        self.music_values = []
        self.allow_asset = True
        self.duplicate_id = 8

    @staticmethod
    def production(production_id):
        return {"id": production_id} if production_id in {6, 9} else None

    def part(self, production_id, part_id):
        return self.parts.get(part_id) if production_id == 6 else None

    @staticmethod
    def music(_production_id):
        return {"music_of": None}

    def set_music(self, production_id, values):
        self.music_values.append((production_id, values))
        return True

    @staticmethod
    def reorder(_production_id, _order):
        return True

    def create_part(self, production_id, values, insert_at=None,
                    before_part_public_id=None):
        self.created.append((production_id, values, insert_at,
                             before_part_public_id))
        return 101

    def asset(self, asset_id):
        return self.assets.get(asset_id)

    def asset_context(self, asset_id):
        return self.assets.get(asset_id, {}).get("context")

    def asset_allowed(self, _production_id, _asset_id, _kinds):
        return self.allow_asset

    def insert_asset(self, production_id, asset_id, insert_at,
                     before_part_public_id=None):
        self.inserted_assets.append((production_id, asset_id, insert_at,
                                     before_part_public_id))
        return 102

    def replace_asset(self, production_id, part_id, asset_id):
        self.replaced_assets.append((production_id, part_id, asset_id))
        return True

    def duplicate(self, production_id, part_id, filename):
        self.duplicated.append((production_id, part_id, filename))
        return self.duplicate_id

    @staticmethod
    def delete(_production_id, _ids):
        return []

    @staticmethod
    def move(_source, _ids, _destination):
        return True

    @staticmethod
    def takes(_production_id, _part_id):
        return [{"id": 12}]

    @staticmethod
    def promote(_production_id, _part_id, take_id, expected_revision,
                confirm_outdated=False):
        if take_id != 12:
            return None
        if expected_revision != 3:
            return {"status": "conflict", "revision": 3}
        if not confirm_outdated:
            return {"status": "confirmation_required", "revision": 3,
                    "outdated": True}
        return {"status": "ok", "revision": 3, "outdated": True}

    @staticmethod
    def save_script(_production_id, _part_id, _script, _values=None):
        return True

    @staticmethod
    def save_editorial(_production_id, _part_id, expected_revision, values):
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
            self.service.music(404)
        with self.assertRaisesRegex(TimelineError, "Part"):
            self.service.duplicate(6, 404)
        self.assertFalse(self.records.duplicated)

    def test_silence_is_clamped_and_saved_with_exact_free_contract(self):
        result = self.service.add_silence(6, 500, 3)
        _, values, insert_at, before_part_id = self.records.created[0]
        self.assertEqual(result, {"id": 101, "seconds": 120.0})
        self.assertEqual((values["kind"], values["duration_ms"], insert_at),
                         ("silence", 120_000, 3))
        self.assertIsNone(before_part_id)
        self.assertEqual(values["cost_basis"], "not billed")

    def test_draft_preserves_composer_settings_without_provider_work(self):
        self.service.add_draft(6, {
            "text": "  Rest now  ", "voice": "custom:serenity",
            "voice_identity_id": "voice-1", "engine": "omni",
            "model": "plus", "insert_at": 2,
        })
        _, values, insert_at, _ = self.records.created[0]
        self.assertEqual((values["text"], values["voice_identity_id"],
                          values["kind"], insert_at),
                         ("Rest now", "voice-1", "draft", 2))

    def test_music_and_clip_enforce_venture_library_semantics(self):
        self.records.allow_asset = False
        with self.assertRaisesRegex(TimelineError, "Music library"):
            self.service.set_music(6, {"music_of": 55})
        self.assertFalse(self.records.music_values)
        self.records.assets[55] = {
            "filename": "bed.mp3", "context": {"collection": "Music"}}
        with self.assertRaisesRegex(TimelineError, "background bed"):
            self.service.insert_asset(6, 55, None)

    def test_public_part_anchor_is_the_stable_insertion_contract(self):
        self.service.add_silence(6, 2, None, "part-before")
        self.assertEqual(self.records.created[0][2:],
                         (None, "part-before"))
        self.records.assets[55] = {
            "filename": "intro.mp3", "context": {"collection": "Intros"}}
        self.service.insert_asset(6, 55, None, "part-before")
        self.assertEqual(self.records.inserted_assets,
                         [(6, 55, None, "part-before")])

    def test_asset_replacement_keeps_the_part_identity(self):
        self.records.parts[7]["kind"] = "asset"
        self.records.assets[55] = {"filename": "outro.mp3"}
        self.assertEqual(self.service.replace_asset(6, 7, 55), {"id": 7})
        self.assertEqual(self.records.replaced_assets, [(6, 7, 55)])
        self.records.parts[7]["kind"] = "speech"
        with self.assertRaisesRegex(TimelineError, "not a Venture Asset"):
            self.service.replace_asset(6, 7, 55)

    def test_duplicate_database_failure_discards_new_file(self):
        self.records.duplicate_id = None
        with self.assertRaisesRegex(TimelineError, "could not be duplicated"):
            self.service.duplicate(6, 7)
        self.assertEqual(self.workspace.discarded, ["part-copy.mp3"])

    def test_take_promotion_and_captions_share_injected_transcript_state(self):
        review = self.service.promote(6, 7, 12, 3)
        self.assertEqual(review, {"ok": False, "needs_confirmation": True,
                                 "outdated": True, "revision": 3})
        self.assertEqual(self.transcripts.stale, [])
        promoted = self.service.promote(6, 7, 12, 3, True)
        self.assertEqual(promoted, {
            "ok": True, "needs_confirmation": False, "outdated": True,
            "revision": 3, "subtitles_stale": 2})
        self.assertEqual(self.transcripts.stale, [7])
        self.assertEqual(self.service.captions(6, 7), [{"part_id": 7}])

    def test_editorial_update_is_revision_guarded(self):
        changed = self.service.save_editorial(
            6, 7, 3, {"script": "New canonical words"})
        self.assertEqual(changed, {"ok": True, "changed": True,
                                  "revision": 4, "outdated": True})
        with self.assertRaisesRegex(Exception, "changed in another view"):
            self.service.save_editorial(
                6, 7, 2, {"script": "Stale edit"})


if __name__ == "__main__":
    unittest.main()
