"""Pure contracts for Activity and System operational services."""

from __future__ import annotations

import unittest

from origins.application.activity import ActivityService
from origins.application.system import SystemService


class LedgerFake:
    def __init__(self):
        self.request = None

    def snapshot(self, *, limit=80, kind="", failed_only=False):
        self.request = {
            "limit": limit, "kind": kind, "failed_only": failed_only}
        return {"runs": 2, "runs_list": [{"id": "job_fixture"}]}


class DatabaseFake:
    def __init__(self, connected=True):
        self.connected = connected

    def database_status(self):
        return {"connected": self.connected, "count": 12}


class WorkerFake:
    def __init__(self, ready=True):
        self.ready = ready
        self.calls = 0

    def status(self, stale_seconds=10):
        self.calls += 1
        return {"ready": self.ready,
                "status": "ready" if self.ready else "stale"}


class OperationalServiceTests(unittest.TestCase):
    def test_activity_forwards_operator_filters_without_hidden_mutation(self):
        ledger = LedgerFake()
        result = ActivityService(ledger).snapshot(
            limit=25, kind="speech", failed_only=True)
        self.assertEqual(result["runs_list"][0]["id"], "job_fixture")
        self.assertEqual(ledger.request, {
            "limit": 25, "kind": "speech", "failed_only": True})

    def test_system_is_healthy_only_when_database_and_worker_are_ready(self):
        result = SystemService(
            DatabaseFake(connected=True), WorkerFake(ready=True)).health()
        self.assertEqual(result["status"], "ok")
        self.assertTrue(result["worker"]["ready"])
        degraded = SystemService(
            DatabaseFake(connected=True), WorkerFake(ready=False)).health()
        self.assertEqual(degraded["status"], "degraded")
        self.assertEqual(degraded["worker"]["status"], "stale")

    def test_database_outage_short_circuits_the_worker_repository(self):
        worker = WorkerFake()
        result = SystemService(DatabaseFake(connected=False), worker).health()
        self.assertEqual(result["status"], "degraded")
        self.assertEqual(result["worker"]["status"], "database_unavailable")
        self.assertEqual(worker.calls, 0)


if __name__ == "__main__":
    unittest.main()
