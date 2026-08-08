"""PostgreSQL reads shared by native speech-producing capabilities."""

from __future__ import annotations

from audio_studio.infrastructure.postgres.session import read_only
from services.alibaba import voice_registry


class SpeechRepository:
    def voice_bindings(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT binding.provider_voice_id, binding.model_id,
                       binding.engine, binding.tier, binding.status,
                       binding.languages, identity.id, identity.name
                  FROM voice_bindings binding
                  JOIN voice_identities identity
                    ON identity.id = binding.identity_id
                 WHERE binding.source = 'custom'
                   AND identity.status = 'active'
                 ORDER BY identity.name, binding.model_id
            """)
            custom = [{
                "provider_voice_id": row[0], "voice_id": row[0],
                "model_id": row[1], "target_model": row[1],
                "engine": row[2], "tier": row[3], "status": row[4],
                "languages": row[5] or [], "identity_id": row[6],
                "name": row[7], "source": "custom", "provider": "alibaba",
            } for row in cursor.fetchall()]
        return [*voice_registry.system_bindings(), *custom]

    def pronunciations(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, pattern, replacement, whole_word, match_case,
                       enabled, phoneme
                  FROM pronunciations
                 WHERE enabled
                 ORDER BY length(pattern) DESC, id
            """)
            keys = ("id", "pattern", "replacement", "whole_word",
                    "match_case", "enabled", "phoneme")
            return [dict(zip(keys, row)) for row in cursor.fetchall()]

    def today_spend(self) -> float:
        with read_only() as cursor:
            cursor.execute("""
                SELECT coalesce(sum(cost) FILTER
                       (WHERE created_at::date = current_date), 0)
                  FROM jobs
            """)
            row = cursor.fetchone()
            return float(row[0] or 0) if row else 0.0
