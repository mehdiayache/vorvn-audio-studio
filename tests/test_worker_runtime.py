"""Worker ownership regression tests against the configured PostgreSQL."""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timezone
from contextlib import contextmanager
from unittest.mock import patch

import psycopg

from audio_studio.config import settings
from audio_studio.infrastructure.postgres.worker_runtime import (
    WorkerRuntimeRepository,
)
from audio_studio.infrastructure.postgres import worker_runtime


class CursorFake:
    def __init__(self, row):
        self.row = row

    def execute(self, *_args):
        pass

    def fetchone(self):
        return self.row


@contextmanager
def read_only_row(row):
    yield CursorFake(row)


class WorkerRuntimeTests(unittest.TestCase):
    def test_health_rejects_a_worker_from_another_runtime(self):
        now = datetime.now(timezone.utc)
        row = (4321, "ready", now, now, True, {
            "runtime_id": "old-runtime", "parent_pid": 100,
        })
        with patch.object(
                worker_runtime, "read_only",
                side_effect=lambda: read_only_row(row)), patch.dict(
                    os.environ, {"AUDIO_STUDIO_RUNTIME_ID": "new-runtime"}):
            status = WorkerRuntimeRepository().status()
        self.assertFalse(status["ready"])
        self.assertEqual(status["status"], "runtime_mismatch")
        self.assertEqual(status["actual_runtime_id"], "old-runtime")
        self.assertEqual(status["expected_runtime_id"], "new-runtime")

    def test_only_one_worker_can_own_the_queue(self):
        try:
            with psycopg.connect(settings.database_url):
                pass
        except psycopg.OperationalError as exc:
            self.skipTest(str(exc))

        isolated_lock = 0x4155444900000000 + os.getpid()
        first = WorkerRuntimeRepository(isolated_lock)
        second = WorkerRuntimeRepository(isolated_lock)
        try:
            self.assertTrue(first.acquire())
            self.assertFalse(second.acquire())
            first.release()
            self.assertTrue(second.acquire())
        finally:
            first.release()
            second.release()


if __name__ == "__main__":
    unittest.main()
