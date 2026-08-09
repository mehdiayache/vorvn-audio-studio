#!/usr/bin/env python3
"""Accounting regressions; transaction is always rolled back, no provider calls."""

import psycopg

from audio_studio.config import settings
from audio_studio.infrastructure.postgres.production_document import (
    ProductionDocumentRepository,
    TAKE_FIELDS,
)


def main() -> int:
    conn = psycopg.connect(settings.database_url)
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, production_id FROM generations
             WHERE version_of IS NULL AND production_id IS NOT NULL
             ORDER BY id LIMIT 1
        """)
        source = cur.fetchone()
        if not source:
            print("FAIL  no canonical Part available for rolled-back regression")
            return 1
        part_id, production_id = source

        copied = [column for column in TAKE_FIELDS if column != "cost"]
        columns = ", ".join(copied)
        cur.execute(
            f"INSERT INTO generations ({columns}, cost, project_id, version_of, failures) "
            f"SELECT {columns}, 10, project_id, %s, failures "
            f"FROM generations WHERE id = %s RETURNING id",
            (part_id, part_id),
        )
        synthetic_take = cur.fetchone()[0]

        cur.execute("""
            SELECT coalesce(sum(all_takes.cost), 0),
                   coalesce((SELECT sum(cost) FROM jobs
                              WHERE kind = 'speech'
                                AND (generation_id = %s OR generation_id IN (
                                  SELECT id FROM generations WHERE version_of = %s))), 0)
              FROM generations all_takes
             WHERE all_takes.id = %s OR all_takes.version_of = %s
        """, (part_id, part_id, part_id, part_id))
        content_cost, tracked_cost = cur.fetchone()
        expected_gap = round(max(0.0, float(content_cost) - float(tracked_cost)), 6)
        assert expected_gap > 0

        ProductionDocumentRepository._recover_spend(cur, [part_id])
        cur.execute("""
            SELECT cost, production_id, generation_id FROM jobs
             WHERE detail = 'Recovered pre-ledger Part spend before deletion'
               AND generation_id = %s ORDER BY id DESC LIMIT 1
        """, (part_id,))
        recovered_cost, recovered_production, recovered_part = cur.fetchone()
        assert float(recovered_cost) == expected_gap
        assert recovered_production == production_id
        assert recovered_part == part_id

        # Recovery is idempotent: after the gap has become a Job, another pass
        # must not manufacture a second expense.
        cur.execute("SELECT count(*) FROM jobs WHERE generation_id = %s AND "
                    "detail = 'Recovered pre-ledger Part spend before deletion'",
                    (part_id,))
        recovered_count = cur.fetchone()[0]
        ProductionDocumentRepository._recover_spend(cur, [part_id])
        cur.execute("SELECT count(*) FROM jobs WHERE generation_id = %s AND "
                    "detail = 'Recovered pre-ledger Part spend before deletion'",
                    (part_id,))
        assert cur.fetchone()[0] == recovered_count

        cur.execute("DELETE FROM generations WHERE id = %s", (synthetic_take,))
        print("PASS  deleted content is recovered into the immutable ledger")
        print("PASS  recovery keeps canonical Production attribution")
        print("PASS  recovery is idempotent")
        return 0
    finally:
        conn.rollback()
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
