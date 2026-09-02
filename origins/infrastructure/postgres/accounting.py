"""Project accounting over durable Jobs and active recording snapshots."""

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


class ProjectAccountingRepository:
    """Read spend history without confusing it with the current edit."""

    def many(self, project_ids: list[int]) -> dict[int, dict]:
        project_ids = [int(item) for item in project_ids]
        if not project_ids:
            return {}
        with read_only() as cur:
            cur.execute("""
                WITH requested AS (SELECT unnest(%s::bigint[]) AS project_id),
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
                  SELECT project_id,
                         coalesce(sum(effective_cost), 0) AS all_spend,
                         coalesce(sum(effective_cost)
                             FILTER (WHERE kind = 'speech'), 0) AS speech_spend,
                         coalesce(sum(effective_cost)
                             FILTER (WHERE kind = ANY(%s::text[])), 0) AS audio_spend,
                         coalesce(sum(effective_cost)
                             FILTER (WHERE kind = ANY(%s::text[])), 0) AS video_spend
                    FROM effective_jobs WHERE project_id = ANY(%s)
                   GROUP BY project_id
                ), retained AS (
                  SELECT part.project_id, coalesce(sum(clip.cost), 0) AS retained_cost
                    FROM clips clip
                    JOIN project_parts part ON part.id=clip.part_id
                   WHERE part.project_id = ANY(%s)
                   GROUP BY part.project_id
                ), current_sequence AS (
                  SELECT pp.project_id, coalesce(sum(clip.cost), 0) AS current_cost
                    FROM project_parts pp
                    JOIN clips clip ON clip.part_id = pp.id
                   WHERE pp.project_id = ANY(%s)
                     AND pp.archived_at IS NULL
                   GROUP BY pp.project_id
                )
                SELECT requested.project_id, coalesce(tracked.all_spend, 0),
                       coalesce(tracked.speech_spend, 0),
                       coalesce(tracked.audio_spend, 0),
                       coalesce(tracked.video_spend, 0),
                       coalesce(retained.retained_cost, 0),
                       coalesce(current_sequence.current_cost, 0)
                  FROM requested
                  LEFT JOIN tracked USING (project_id)
                  LEFT JOIN retained USING (project_id)
                  LEFT JOIN current_sequence USING (project_id)
            """, (
                project_ids, sorted(AUDIO_SPEND_KINDS),
                sorted(VIDEO_SPEND_KINDS), project_ids,
                project_ids, project_ids,
            ))
            result = {}
            for (project_id, tracked, tracked_speech, audio_spend,
                 video_spend, retained, current) in cur.fetchall():
                tracked, tracked_speech = float(tracked), float(tracked_speech)
                audio_spend, video_spend = float(audio_spend), float(video_spend)
                retained, current = float(retained), float(current)
                other_spend = max(0.0, tracked - audio_spend - video_spend)
                result[project_id] = {
                    "historical_spend": round(tracked, 6),
                    "current_sequence_cost": round(current, 6),
                    "retained_generation_cost": round(retained, 6),
                    "tracked_spend": round(tracked, 6),
                    "audio_spend": round(audio_spend, 6),
                    "video_spend": round(video_spend, 6),
                    "other_spend": round(other_spend, 6),
                }
            return result

    def one(self, project_id: int) -> dict:
        return self.many([project_id]).get(int(project_id), dict(ZERO_ACCOUNTING))
