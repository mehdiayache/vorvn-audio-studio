"""Saved subtitle catalogue tests; no database or provider calls."""

import unittest

from audio_studio.application.subtitles import SubtitleCatalogueService


SENTENCES = [{
    "start": 0, "end": 1200, "text": "Hello world.",
    "words": [
        {"start": 0, "end": 500, "text": "Hello"},
        {"start": 550, "end": 1200, "text": "world."},
    ],
}]


class FakeRecords:
    def __init__(self, item=None):
        self.item = item
        self.limits = []
        self.deleted = []

    def list(self, limit=40):
        self.limits.append(limit)
        return [{"id": 7}]

    def get(self, transcript_id):
        return self.item if transcript_id == 7 else None

    def delete(self, transcript_id):
        self.deleted.append(transcript_id)
        return transcript_id == 7


class FakeMedia:
    def __init__(self, available=True):
        self.available = available
        self.calls = []

    def resolve(self, kind, name, folder=None):
        self.calls.append((kind, name, folder))
        return object() if self.available else None


def transcript():
    return {
        "id": 7, "public_id": "subtitle-public-id", "name": "speech.mp3",
        "audio_url": "/audio/speech.mp3", "text": "Hello world.",
        "srt": "saved srt", "vtt": "saved vtt", "sentences": SENTENCES,
        "duration_ms": 1200, "language": "English",
        "created_at": "2026-08-09T00:00:00+00:00",
        "catalog_cost": "0.000035", "catalog_rate": "0.000035",
        "cost_basis": "catalog_duration", "model": "qwen-asr",
        "provider_region": "intl", "price_version": "2026-08-07",
        "source_job_public_id": "job-public-id",
    }


class SubtitleCatalogueTests(unittest.TestCase):
    def test_list_clamps_limits_and_detail_preserves_public_accounting(self):
        records, media = FakeRecords(transcript()), FakeMedia()
        service = SubtitleCatalogueService(records, media)
        self.assertEqual(service.list(999), [{"id": 7}])
        self.assertEqual(records.limits, [200])
        detail = service.get(7)
        self.assertEqual(detail["public_id"], "subtitle-public-id")
        self.assertEqual(detail["source_job_id"], "job-public-id")
        self.assertEqual(detail["cost"], 0.000035)
        self.assertEqual(detail["url"], "/audio/speech.mp3")
        self.assertEqual(media.calls, [("audio", "speech.mp3", None)])

    def test_missing_local_audio_is_hidden_without_losing_subtitles(self):
        service = SubtitleCatalogueService(
            FakeRecords(transcript()), FakeMedia(available=False))
        detail = service.get(7)
        self.assertIsNone(detail["url"])
        self.assertEqual(detail["text"], "Hello world.")
        self.assertEqual(detail["srt"], "saved srt")

    def test_layouts_are_derived_and_missing_records_remain_distinct(self):
        service = SubtitleCatalogueService(FakeRecords(transcript()), FakeMedia())
        words = service.layout(7, "words")
        self.assertEqual([cue["text"] for cue in words["cues"]],
                         ["Hello", "world."])
        self.assertIsNone(service.layout(404, "standard"))
        self.assertIsNone(service.get(404))
        self.assertTrue(service.delete(7))
        self.assertFalse(service.delete(404))


if __name__ == "__main__":
    unittest.main()
