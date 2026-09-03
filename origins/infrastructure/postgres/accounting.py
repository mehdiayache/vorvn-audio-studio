"""Production accounting over durable Jobs and active recording snapshots."""

from __future__ import annotations

from origins.domain.spend_classification import (
    AUDIO_SPEND_KINDS, VIDEO_SPEND_KINDS,
)
from origins.infrastructure.postgres.session import read_only


ZERO_ACCOUNTING = {
    "historical_spend": 0.0,
    "current_sequence_cost": 0.0,
    "retained_generation_cost": 0.0,
    "tracked_spend": 0.0,
    "audio_spend": 0.0,
    "video_spend": 0.0,
    "other_spend": 0.0,
}


class ProductionAccountingRepository:
    """Read spend history without confusing it with the current edit."""

    def many(self, production_ids: list[int]) -> dict[int, dict]:
        production_ids = [int(item) for item in production_ids]
        if not production_ids:
            return {}
        with read_only() as cur:
            cur.execute("""
                WITH requested AS (SELECT unnest(%s::bigint[]) AS production_id),
                attempt_costs AS (
                  SELECT job_id, count(*) AS attempt_count,
                         sum(CASE WHEN status='ambiguous'
                             THEN greatest(estimated_cost,coalesce(cost,0))
                             ELSE coalesce(cost,0) END) AS provider_cost
                    FROM provider_attempts GROUP BY job_id
                ), effective_jobs AS (
                  SELECT job.*,
                         CASE WHEN attempt.attempt_count > 0
                              THEN attempt.provider_cost ELSE job.cost END
                              AS effective_cost
                    FROM jobs job
                    LEFT JOIN attempt_costs attempt ON attempt.job_id=job.id
                ),
                tracked AS (
                  SELECT production_id,
                         coalesce(sum(effective_cost), 0) AS all_spend,
                         coalesce(sum(effective_cost)
                             FILTER (WHERE kind = 'speech'), 0) AS speech_spend,
                         coalesce(sum(effective_cost)
                             FILTER (WHERE kind = ANY(%s::text[])), 0) AS audio_spend,
                         coalesce(sum(effective_cost)
                             FILTER (WHERE kind = ANY(%s::text[])), 0) AS video_spend
                    FROM effective_jobs WHERE production_id = ANY(%s)
                   GROUP BY production_id
                ), retained AS (
                  SELECT part.production_id, coalesce(sum(clip.cost), 0) AS retained_cost
                    FROM clips clip
                    JOIN production_parts part ON part.id=clip.part_id
                   WHERE part.production_id = ANY(%s)
                   GROUP BY part.production_id
                ), current_sequence AS (
                  SELECT pp.production_id, coalesce(sum(clip.cost), 0) AS current_cost
                    FROM production_parts pp
                    JOIN clips clip ON clip.part_id = pp.id
                   WHERE pp.production_id = ANY(%s)
                     AND pp.archived_at IS NULL
                   GROUP BY pp.production_id
                )
                SELECT requested.production_id, coalesce(tracked.all_spend, 0),
                       coalesce(tracked.speech_spend, 0),
                       coalesce(tracked.audio_spend, 0),
                       coalesce(tracked.video_spend, 0),
                       coalesce(retained.retained_cost, 0),
                       coalesce(current_sequence.current_cost, 0)
                  FROM requested
                  LEFT JOIN tracked USING (production_id)
                  LEFT JOIN retained USING (production_id)
                  LEFT JOIN current_sequence USING (production_id)
            """, (
                production_ids, sorted(AUDIO_SPEND_KINDS),
                sorted(VIDEO_SPEND_KINDS), production_ids,
                production_ids, production_ids,
            ))
            result = {}
            for (production_id, tracked, tracked_speech, audio_spend,
                 video_spend, retained, current) in cur.fetchall():
                tracked, tracked_speech = float(tracked), float(tracked_speech)
                audio_spend, video_spend = float(audio_spend), float(video_spend)
                retained, current = float(retained), float(current)
                other_spend = max(0.0, tracked - audio_spend - video_spend)
                result[production_id] = {
                    "historical_spend": round(tracked, 6),
                    "current_sequence_cost": round(current, 6),
                    "retained_generation_cost": round(retained, 6),
                    "tracked_spend": round(tracked, 6),
                    "audio_spend": round(audio_spend, 6),
                    "video_spend": round(video_spend, 6),
                    "other_spend": round(other_spend, 6),
                }
            return result

    def one(self, production_id: int) -> dict:
        return self.many([production_id]).get(int(production_id), dict(ZERO_ACCOUNTING))
