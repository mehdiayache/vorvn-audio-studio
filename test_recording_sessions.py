"""Standalone recording-session application and HTTP contracts."""

import json
import unittest
from uuid import uuid4

from audio_studio.application.recording_sessions import RecordingSessionService
from audio_studio.http.routers.jobs import SpeechJobCreate


class FakeLedger:
    def __init__(self, attempts):
        self.rows = attempts
        self.requested = None

    def attempts(self, session_id):
        self.requested = session_id
        return self.rows


class RecordingSessionTests(unittest.TestCase):
    def test_session_groups_attempts_and_totals_recorded_cost(self):
        session_id = uuid4()
        ledger = FakeLedger([
            {"id": "a", "cost": .001},
            {"id": "b", "cost": .0025},
        ])
        result = RecordingSessionService(ledger).get(session_id)
        self.assertEqual(result["id"], str(session_id))
        self.assertEqual(result["total_cost"], .0035)
        self.assertEqual(ledger.requested, session_id)

    def test_speech_contract_accepts_session_only_for_standalone_create(self):
        session_id = uuid4()
        base = {
            "text": "Hello", "catalogue_voice_id": "catalogue:voice",
            "insert_at": None, "session_id": session_id,
        }
        contract = SpeechJobCreate(**base)
        self.assertEqual(contract.session_id, session_id)
        persisted = contract.model_dump(exclude_unset=True, mode="json")
        self.assertEqual(persisted["session_id"], str(session_id))
        json.dumps(persisted)
        with self.assertRaisesRegex(ValueError, "cannot belong to a Production"):
            SpeechJobCreate(**base, production_id=8)


if __name__ == "__main__":
    unittest.main()
