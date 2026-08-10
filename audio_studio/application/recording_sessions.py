"""Read model for standalone Speak attempts grouped into one recording session."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID


class RecordingSessionLedger(Protocol):
    def attempts(self, session_id: UUID) -> list[dict]: ...


class RecordingSessionService:
    def __init__(self, ledger: RecordingSessionLedger):
        self.ledger = ledger

    def get(self, session_id: UUID) -> dict:
        attempts = self.ledger.attempts(session_id)
        return {
            "id": str(session_id),
            "attempts": attempts,
            "total_cost": round(sum(
                float(attempt.get("cost") or 0) for attempt in attempts
            ), 6),
        }
