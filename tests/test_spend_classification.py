import unittest
from contextlib import contextmanager
from unittest.mock import patch
from uuid import uuid4

import psycopg

from origins.config import settings
from origins.domain.spend_classification import spend_category
from origins.infrastructure.postgres.accounting import ProjectAccountingRepository
from origins.infrastructure.postgres.activity import ActivityRepository
from origins.infrastructure.postgres.workspaces import WorkspaceRepository


class _AccountingCursor:
    def execute(self, *_args):
        pass

    def fetchall(self):
        # project, all, speech, audio, video, retained, current
        return [(7, 6, 1, 1, 2, 1, 0)]


class _ActivityCursor:
    def __init__(self):
        self.step = 0

    def execute(self, *_args):
        self.step += 1

    def fetchall(self):
        return []

    def fetchone(self):
        if self.step == 3:
            # totals, run counts, then audio/video/other for each period
            return (6, 6, 6, 3, 0, 1, 2, 3, 1, 2, 3, 1, 2, 3)
        if self.step == 4:
            return (0,)
        raise AssertionError(f"Unexpected fetchone at step {self.step}")


@contextmanager
def _cursor(value):
    yield value


class SpendClassificationTest(unittest.TestCase):
    def test_operation_kinds_are_explicit_not_everything_non_video_is_audio(self):
        self.assertEqual(spend_category("speech"), "audio")
        self.assertEqual(spend_category("audio_generate"), "audio")
        self.assertEqual(spend_category("clone"), "audio")
        self.assertEqual(spend_category("media_generate"), "video")
        for kind in ("translate", "transcribe", "rewrite", "render"):
            self.assertEqual(spend_category(kind), "other")

    def test_project_regression_sums_audio_video_other_and_historical(self):
        with patch(
            "origins.infrastructure.postgres.accounting.read_only",
            return_value=_cursor(_AccountingCursor()),
        ):
            result = ProjectAccountingRepository().one(7)
        self.assertEqual(result["audio_spend"], 1)
        self.assertEqual(result["video_spend"], 2)
        self.assertEqual(result["other_spend"], 3)
        self.assertEqual(result["historical_spend"], 6)

    def test_activity_uses_the_same_three_way_totals_for_every_period(self):
        with patch(
            "origins.infrastructure.postgres.activity.read_only",
            return_value=_cursor(_ActivityCursor()),
        ):
            result = ActivityRepository().snapshot()
        expected = {"audio": 1, "video": 2, "other": 3}
        self.assertEqual(result["today_media"], expected)
        self.assertEqual(result["month_media"], expected)
        self.assertEqual(result["total_media"], expected)
        self.assertEqual(result["total"], 6)

    def test_real_postgres_aggregates_speech_media_and_translation_jobs(self):
        try:
            database = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            self.skipTest(str(error))
        marker = f"accounting-regression-{uuid4().hex}"
        workspace = WorkspaceRepository().create_workspace(
            "Accounting Workspace", "Disposable accounting regression fixture")
        project = WorkspaceRepository().create_audiovisual_project(
            workspace["id"], "Accounting Project", "", None)
        if project is None:
            self.fail("Could not create the canonical Project fixture")
        project_id = int(project["id"])
        job_ids: list[int] = []
        try:
            before = ProjectAccountingRepository().one(project_id)
            with database.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO jobs
                        (kind, status, cost, project_id, detail)
                    VALUES
                        ('speech', 'ok', 1, %s, %s),
                        ('media_generate', 'ok', 2, %s, %s),
                        ('translate', 'ok', 3, %s, %s)
                    RETURNING id
                """, (
                    project_id, marker,
                    project_id, marker,
                    project_id, marker,
                ))
                job_ids = [int(row[0]) for row in cursor.fetchall()]
            database.commit()
            after = ProjectAccountingRepository().one(project_id)
            self.assertAlmostEqual(
                after["audio_spend"] - before["audio_spend"], 1, places=6)
            self.assertAlmostEqual(
                after["video_spend"] - before["video_spend"], 2, places=6)
            self.assertAlmostEqual(
                after["other_spend"] - before["other_spend"], 3, places=6)
            self.assertAlmostEqual(
                after["historical_spend"] - before["historical_spend"],
                6, places=6)
        finally:
            if job_ids:
                with database.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM jobs WHERE id = ANY(%s)", (job_ids,))
                database.commit()
            database.close()
            with psycopg.connect(settings.database_url) as cleanup:
                cleanup.execute(
                    "DELETE FROM workspaces WHERE id=%s", (workspace["id"],))


if __name__ == "__main__":
    unittest.main()
