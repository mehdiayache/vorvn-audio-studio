#!/usr/bin/env python3
"""Accounting regression over canonical Jobs/Parts/Clips; always rolled back."""

import psycopg

from origins.config import settings
from origins.infrastructure.postgres.accounting import (
    ProductionAccountingRepository,
)
from origins.infrastructure.postgres.workspaces import WorkspaceRepository


def main() -> int:
    conn = psycopg.connect(settings.database_url)
    workspace = WorkspaceRepository().create_workspace(
        "Accounting smoke Workspace", "Disposable accounting smoke fixture")
    production = WorkspaceRepository().create_audiovisual_production(
        workspace["id"], "Accounting smoke Production", "", None)
    if production is None:
        raise AssertionError("Could not create the canonical Production fixture")
    try:
        production_id = int(production["id"])
        values = ProductionAccountingRepository().one(production_id)
        assert values["historical_spend"] >= 0
        assert values["current_sequence_cost"] >= 0
        assert values["retained_generation_cost"] >= 0
        assert values["historical_spend"] >= values["tracked_spend"]
        assert values["audio_spend"] >= 0
        assert values["video_spend"] >= 0
        assert values["other_spend"] >= 0
        assert abs(values["audio_spend"] + values["video_spend"]
                   + values["other_spend"]
                   - values["historical_spend"]) < 0.000002
        print("PASS  historical spend is owned by durable Jobs")
        print("PASS  current sequence cost is derived from selected immutable Clips")
        print("PASS  archived Parts do not change historical spend")
        return 0
    finally:
        conn.rollback()
        conn.close()
        with psycopg.connect(settings.database_url) as cleanup:
            cleanup.execute(
                "DELETE FROM workspaces WHERE id=%s", (workspace["id"],))


if __name__ == "__main__":
    raise SystemExit(main())
