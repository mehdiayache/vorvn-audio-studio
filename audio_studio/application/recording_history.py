"""Read model for every reusable standalone Speak recording."""

from __future__ import annotations

from typing import Protocol


class RecordingHistoryLedger(Protocol):
    def recordings(self) -> list[dict]: ...


class RecordingHistoryService:
    def __init__(self, ledger: RecordingHistoryLedger):
        self.ledger = ledger

    def get(self) -> dict:
        recordings = self.ledger.recordings()
        return {
            "recordings": recordings,
            "total_cost": round(sum(
                float(recording.get("cost") or 0) for recording in recordings
            ), 6),
        }
