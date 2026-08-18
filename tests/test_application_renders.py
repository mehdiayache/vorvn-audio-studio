"""Render orchestration tests without FFmpeg, files or PostgreSQL."""

from pathlib import Path
import unittest

from audio_studio.application.renders import RenderService
from audio_studio.domain.rendering import FinishedExport, RenderError
from audio_studio.domain.sound_scene import empty_scene


PART = {
    "id": 7, "kind": "audio", "title": "Opening",
    "filename": "opening.mp3", "duration_ms": 1000,
    "missing": False,
}


class FakeRecords:
    def __init__(self, parts=None):
        self.part_items = list(parts if parts is not None else [dict(PART)])
        self.created = []
        self.fail_create = False

    @staticmethod
    def production(production_id):
        return ({"id": production_id, "name": "Evening Reset"}
                if production_id == 6 else None)

    def parts(self, _production_id):
        return self.part_items

    @staticmethod
    def sound_scene(_production_id):
        return {"document": empty_scene()}

    @staticmethod
    def transcript(generation_id):
        if generation_id != 7:
            return None
        return {"sentences": [{"start": 0, "end": 700,
                                "text": "Rest now"}], "stale": False}

    def create_export(self, production_id, *, artifact):
        if self.fail_create:
            raise RuntimeError("database unavailable")
        self.created.append((production_id, artifact))
        return {"export_id": 91, "generation_id": 150}


class FakeWorkspace:
    def __init__(self):
        self.previews = []
        self.finished = []
        self.finished_scenes = []
        self.discarded = []

    @staticmethod
    def duration_for_part(_part):
        return 1000

    def preview(
            self, production_id, parts, scene, *, skipped_drafts):
        self.previews.append((production_id, parts, scene, skipped_drafts))
        return {"name": "preview.mp3", "cached": False,
                "skipped_drafts": skipped_drafts}

    def finish_export(
            self, production_id, production_name, parts, scene, subtitles):
        artifact = FinishedExport(
            target=Path("/media/final.mp3"),
            manifest_path=Path("/media/final.manifest.json"),
            caption_paths=(Path("/media/final.srt"),),
            filename="final.mp3", manifest={"parts": parts},
            renderer="fixture", duration_ms=1000, size_bytes=1000,
            part_count=len(parts), subtitles=subtitles,
            mixed=any(track["clips"] for track in scene["tracks"]),
        )
        self.finished.append(artifact)
        self.finished_scenes.append(scene)
        return artifact

    def discard_export(self, artifact):
        self.discarded.append(artifact)


class RenderServiceTests(unittest.TestCase):
    def test_preview_skips_drafts_their_following_silence_and_stitches(self):
        records = FakeRecords([
            dict(PART), {**PART, "id": 8, "kind": "draft"},
            {"id": 9, "kind": "silence", "duration_ms": 800},
            {**PART, "id": 10, "kind": "stitch"},
            {**PART, "id": 11},
        ])
        workspace = FakeWorkspace()
        result = RenderService(records, workspace).preview(6)
        self.assertEqual(result["skipped_drafts"], 1)
        self.assertEqual(
            [part["id"] for part in workspace.previews[0][1]], [7, 11])

    def test_preview_and_export_exclude_disabled_parts_and_drafts(self):
        records = FakeRecords([
            dict(PART), {**PART, "id": 8, "enabled": False},
            {**PART, "id": 9, "kind": "draft", "enabled": False},
        ])
        workspace = FakeWorkspace()
        RenderService(records, workspace).preview(6)
        self.assertEqual([part["id"] for part in workspace.previews[0][1]], [7])
        self.assertEqual(workspace.previews[0][3], 0)
        RenderService(records, workspace).export(6)
        self.assertEqual(workspace.finished[0].part_count, 1)

    def test_export_rejects_drafts_and_missing_audio_before_finishing(self):
        workspace = FakeWorkspace()
        with self.assertRaisesRegex(RenderError, "Draft"):
            RenderService(FakeRecords([
                dict(PART), {**PART, "id": 8, "kind": "draft"},
            ]), workspace).export(6)
        self.assertFalse(workspace.finished)
        with self.assertRaisesRegex(RenderError, "missing"):
            RenderService(FakeRecords([
                {**PART, "missing": True},
            ]), workspace).export(6)
        self.assertFalse(workspace.finished)

    def test_confirmed_incomplete_export_omits_draft_and_its_pause(self):
        records = FakeRecords([
            dict(PART),
            {**PART, "id": 8, "kind": "draft"},
            {"id": 9, "kind": "silence", "duration_ms": 800},
            {**PART, "id": 10},
        ])
        workspace = FakeWorkspace()

        result = RenderService(records, workspace).export(
            6, allow_incomplete=True)

        self.assertEqual(result["skipped_drafts"], 1)
        self.assertEqual(workspace.finished[0].part_count, 2)
        self.assertEqual(
            [part["id"] for part in workspace.finished[0].manifest["parts"]],
            [7, 10],
        )

    def test_export_offsets_subtitles_and_records_canonical_identity(self):
        records = FakeRecords([
            {"id": 3, "kind": "silence", "title": "9",
             "duration_ms": 2000},
            dict(PART),
        ])
        workspace = FakeWorkspace()
        result = RenderService(records, workspace).export(6)
        artifact = records.created[0][1]
        self.assertEqual(result["export_id"], 91)
        self.assertEqual(artifact.subtitles["cues"], 1)
        self.assertIn("00:00:02,000", artifact.subtitles["srt"])

    def test_failed_canonical_record_discards_all_new_export_files(self):
        records = FakeRecords()
        records.fail_create = True
        workspace = FakeWorkspace()
        with self.assertRaisesRegex(RuntimeError, "database"):
            RenderService(records, workspace).export(6)
        self.assertEqual(workspace.discarded, workspace.finished)

    def test_preview_and_export_share_the_exact_resolved_scene(self):
        records = FakeRecords()
        workspace = FakeWorkspace()
        service = RenderService(records, workspace)
        service.preview(6)
        service.export(6)
        self.assertEqual(workspace.previews[0][2], workspace.finished_scenes[0])


if __name__ == "__main__":
    unittest.main()
