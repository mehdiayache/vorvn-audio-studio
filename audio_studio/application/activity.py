"""Operator Activity use case built from a durable ledger port."""

from __future__ import annotations

from typing import Protocol


class ActivityLedger(Protocol):
    def snapshot(self, *, limit: int = 80, kind: str = "",
                 failed_only: bool = False) -> dict: ...


class ActivityService:
    def __init__(self, ledger: ActivityLedger):
        self.ledger = ledger

    def snapshot(self, *, limit: int = 80, kind: str = "",
                 failed_only: bool = False) -> dict:
        return self.ledger.snapshot(
            limit=limit, kind=kind, failed_only=failed_only)
