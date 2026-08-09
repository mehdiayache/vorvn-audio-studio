"""Worker ownership regression tests against the configured PostgreSQL."""

from __future__ import annotations

import os
import unittest

import psycopg

from audio_studio.config import settings
from audio_studio.infrastructure.postgres.worker_runtime import (
    WorkerRuntimeRepository,
)


class WorkerRuntimeTests(unittest.TestCase):
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
