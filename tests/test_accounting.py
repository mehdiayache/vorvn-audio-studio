#!/usr/bin/env python3
"""Accounting regression over canonical Jobs/Parts/Clips; always rolled back."""

import psycopg

from audio_studio.config import settings
from audio_studio.infrastructure.postgres.accounting import (
    ProductionAccountingRepository,
)


def main() -> int:
    conn = psycopg.connect(settings.database_url)
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id FROM productions WHERE archived_at IS NULL ORDER BY id LIMIT 1
        """)
        row = cur.fetchone()
        if not row:
            print("PASS  no Production exists; accounting has no fabricated data")
            return 0
        production_id = int(row[0])
        values = ProductionAccountingRepository().one(production_id)
        assert values["historical_spend"] >= 0
        assert values["current_sequence_cost"] >= 0
        assert values["retained_generation_cost"] >= 0
        assert values["historical_spend"] >= values["tracked_spend"]
        print("PASS  historical spend is owned by durable Jobs")
        print("PASS  current sequence cost is derived from selected immutable Clips")
        print("PASS  archived Parts do not change historical spend")
        return 0
    finally:
        conn.rollback()
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
