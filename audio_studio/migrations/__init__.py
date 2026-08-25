"""Versioned PostgreSQL migrations for Auvi Studio."""

from __future__ import annotations

from hashlib import sha256
from importlib import resources

import psycopg

from audio_studio.config import settings


def run() -> list[str]:
    """Apply pending SQL files once and reject edited applied migrations."""
    applied_now: list[str] = []
    with psycopg.connect(settings.database_url) as connection:
        with connection.cursor() as cursor:
            # One database may briefly see multiple app instances during a
            # deploy. Serialize schema ownership before checking pending files.
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (0x415544494F,))
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    checksum TEXT NOT NULL,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            cursor.execute("SELECT version, checksum FROM schema_migrations")
            applied = dict(cursor.fetchall())
            root = resources.files(__package__)
            migrations = sorted(item for item in root.iterdir()
                                if item.name.endswith(".sql"))
            for migration in migrations:
                sql = migration.read_text(encoding="utf-8")
                checksum = sha256(sql.encode()).hexdigest()
                previous = applied.get(migration.name)
                if previous and previous != checksum:
                    raise RuntimeError(
                        f"Applied migration {migration.name} was modified. "
                        "Add a new migration instead."
                    )
                if previous:
                    continue
                cursor.execute(sql)
                cursor.execute(
                    "INSERT INTO schema_migrations (version, checksum) VALUES (%s, %s)",
                    (migration.name, checksum),
                )
                applied_now.append(migration.name)
        connection.commit()
    return applied_now
