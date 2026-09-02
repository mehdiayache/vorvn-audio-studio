"""Read model for every reusable standalone Speak recording."""

from __future__ import annotations

from typing import Protocol


class RecordingHistoryLedger(Protocol):
    def recordings(self, workspace_id: int) -> list[dict]: ...


class RecordingHistoryService:
    def __init__(self, ledger: RecordingHistoryLedger):
        self.ledger = ledger

    def get(self, workspace_id: int) -> dict:
        recordings = self.ledger.recordings(workspace_id)
        return {
            "recordings": recordings,
            "total_cost": round(sum(
                float(recording.get("cost") or 0) for recording in recordings
            ), 6),
        }
