"""PostgreSQL state shared by Settings, catalogues and system health."""

from __future__ import annotations

import json

import psycopg

from audio_studio.config import settings
from audio_studio.infrastructure.postgres.session import read_only, transaction


class ControlPlaneRepository:
    """Own small app-wide settings and operational summary reads."""

    def setting(self, key: str, fallback=None):
        try:
            with read_only() as cursor:
                cursor.execute("SELECT value FROM app_settings WHERE key = %s",
                               (key,))
                row = cursor.fetchone()
                return row[0] if row else fallback
        except psycopg.OperationalError:
            return fallback

    def save_setting(self, key: str, value) -> bool:
        try:
            with transaction() as cursor:
                if value is None:
                    cursor.execute("DELETE FROM app_settings WHERE key = %s",
                                   (key,))
                else:
                    cursor.execute("""
                        INSERT INTO app_settings (key, value)
                        VALUES (%s, %s::jsonb)
                        ON CONFLICT (key) DO UPDATE
                           SET value = EXCLUDED.value, updated_at = now()
                    """, (key, json.dumps(value)))
            return True
        except psycopg.OperationalError:
            return False

    def spend_totals(self) -> dict:
        try:
            with read_only() as cursor:
                cursor.execute("""
                    SELECT coalesce(sum(cost) FILTER
                               (WHERE created_at::date = current_date), 0),
                           coalesce(sum(cost) FILTER
                               (WHERE created_at >= date_trunc('month', now())), 0),
                           coalesce(sum(cost), 0), count(*)
                      FROM jobs
                """)
                today, month, total, runs = cursor.fetchone()
            return {
                "today": float(today), "month": float(month),
                "all_time": float(total), "runs": runs,
            }
        except psycopg.OperationalError:
            return {}

    def database_status(self) -> dict:
        try:
            with psycopg.connect(settings.database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("""
                        SELECT (SELECT count(*) FROM production_parts),
                               (SELECT count(*) FROM takes)
                    """)
                    parts, takes = cursor.fetchone()
            return {"connected": True, "count": parts,
                    "parts": parts, "takes": takes}
        except psycopg.OperationalError as error:
            return {
                "connected": False,
                "reason": f"{type(error).__name__}: {str(error).strip()[:120]}",
            }
