"""One PostgreSQL read model for provider spend shown before paid work."""

from audio_studio.infrastructure.postgres.session import read_only


def today_provider_spend() -> float:
    """Prefer ProviderAttempt truth, retaining old Job-only history."""
    with read_only() as cursor:
        cursor.execute("""
            WITH attempt_costs AS (
              SELECT job_id, sum(CASE WHEN status='ambiguous'
                       THEN greatest(estimated_cost,coalesce(cost,0))
                       ELSE coalesce(cost,0) END) AS provider_cost
                FROM provider_attempts
               WHERE created_at::date=current_date
               GROUP BY job_id
            )
            SELECT coalesce(sum(attempt.provider_cost),0)
                 + coalesce((SELECT sum(job.cost) FROM jobs job
                              WHERE job.created_at::date=current_date
                                AND NOT EXISTS (
                                    SELECT 1 FROM attempt_costs attempt
                                     WHERE attempt.job_id=job.id)),0)
              FROM attempt_costs attempt
        """)
        row = cursor.fetchone()
        return float(row[0] or 0) if row else 0.0
