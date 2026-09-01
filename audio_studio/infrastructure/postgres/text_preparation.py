"""PostgreSQL reads required by text preparation."""

from __future__ import annotations

from audio_studio.infrastructure.postgres.session import read_only
from audio_studio.infrastructure.postgres.spend import today_provider_spend


class PostgresTextPreparationRepository:
    def prompt_settings(self) -> dict:
        with read_only() as cursor:
            cursor.execute("SELECT value FROM app_settings WHERE key = 'prompts'")
            row = cursor.fetchone()
            return row[0] if row and isinstance(row[0], dict) else {}

    def style_for(self, production_id: int) -> str:
        with read_only() as cursor:
            cursor.execute("""
                SELECT coalesce(venture.style_prompt, '')
                  FROM productions production
                  LEFT JOIN work_projects project ON project.id = production.project_id
                  LEFT JOIN ventures venture ON venture.id = project.venture_id
                 WHERE production.id = %s AND production.archived_at IS NULL
            """, (production_id,))
            row = cursor.fetchone()
            return str(row[0] or "") if row else ""

    def today_spend(self) -> float:
        return today_provider_spend()

    def capability_controls(self, capability_id: str) -> dict:
        with read_only() as cursor:
            cursor.execute("""
                SELECT controls FROM capabilities
                 WHERE id=%s AND archived_at IS NULL
            """, (capability_id,))
            row = cursor.fetchone()
        if not row:
            raise ValueError("That recording capability is no longer available.")
        return row[0] or {}
