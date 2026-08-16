"""Reusable standalone recording-history application contracts."""

import unittest

from audio_studio.application.recording_history import RecordingHistoryService
from audio_studio.http.routers.jobs import SpeechJobCreate
from audio_studio.infrastructure.postgres.recording_history import _safe_request


class FakeLedger:
    def __init__(self, recordings):
        self.rows = recordings
        self.requested = False

    def recordings(self):
        self.requested = True
        return self.rows


class RecordingHistoryTests(unittest.TestCase):
    def test_history_collects_all_standalone_recordings_and_cost(self):
        ledger = FakeLedger([
            {"id": "a", "cost": .001},
            {"id": "b", "cost": .0025},
        ])
        result = RecordingHistoryService(ledger).get()
        self.assertEqual([item["id"] for item in result["recordings"]], ["a", "b"])
        self.assertEqual(result["total_cost"], .0035)
        self.assertTrue(ledger.requested)

    def test_standalone_speech_needs_no_grouping_identifier(self):
        contract = SpeechJobCreate(
            text="Hello", catalogue_voice_id="catalogue:voice",
        )
        persisted = contract.model_dump(exclude_unset=True, mode="json")
        self.assertNotIn("session_id", persisted)

    def test_history_preserves_ssml_choice_for_safe_reuse(self):
        request = _safe_request({
            "text": "<speak>Hello</speak>", "enable_ssml": True,
            "provider_secret": "never expose this",
        })
        self.assertTrue(request["enable_ssml"])
        self.assertNotIn("provider_secret", request)


if __name__ == "__main__":
    unittest.main()
