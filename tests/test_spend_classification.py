import unittest
from contextlib import contextmanager
from unittest.mock import patch

from audio_studio.domain.spend_classification import spend_category
from audio_studio.infrastructure.postgres.accounting import ProductionAccountingRepository
from audio_studio.infrastructure.postgres.activity import ActivityRepository


class _AccountingCursor:
    def execute(self, *_args):
        pass

    def fetchall(self):
        # production, all, speech, audio, video, retained, current
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
        self.assertEqual(spend_category("director_generate"), "video")
        for kind in ("translate", "transcribe", "rewrite", "render"):
            self.assertEqual(spend_category(kind), "other")

    def test_production_regression_sums_audio_video_other_and_historical(self):
        with patch(
            "audio_studio.infrastructure.postgres.accounting.read_only",
            return_value=_cursor(_AccountingCursor()),
        ):
            result = ProductionAccountingRepository().one(7)
        self.assertEqual(result["audio_spend"], 1)
        self.assertEqual(result["video_spend"], 2)
        self.assertEqual(result["other_spend"], 3)
        self.assertEqual(result["historical_spend"], 6)

    def test_activity_uses_the_same_three_way_totals_for_every_period(self):
        with patch(
            "audio_studio.infrastructure.postgres.activity.read_only",
            return_value=_cursor(_ActivityCursor()),
        ):
            result = ActivityRepository().snapshot()
        expected = {"audio": 1, "video": 2, "other": 3}
        self.assertEqual(result["today_media"], expected)
        self.assertEqual(result["month_media"], expected)
        self.assertEqual(result["total_media"], expected)
        self.assertEqual(result["total"], 6)


if __name__ == "__main__":
    unittest.main()
