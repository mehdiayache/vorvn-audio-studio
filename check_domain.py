#!/usr/bin/env python3
"""Read-only integrity gate for the canonical Studio domain."""

from audio_studio.infrastructure.postgres.session import read_only


CHECKS = {
    "database enforces same-Project Series placement": """
        SELECT CASE WHEN EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conname = 'productions_series_project_fkey'
             AND conrelid = 'productions'::regclass
        ) THEN 0 ELSE 1 END
    """,
    "every Production has a Project": """
        SELECT count(*) FROM productions production
        LEFT JOIN work_projects project ON project.id = production.project_id
        WHERE project.id IS NULL
    """,
    "every Series belongs to its Production's Project": """
        SELECT count(*) FROM productions production
        JOIN series ON series.id = production.series_id
        WHERE series.project_id <> production.project_id
    """,
    "every canonical Part belongs to an existing Production": """
        SELECT count(*) FROM production_parts part
        LEFT JOIN productions production ON production.id = part.production_id
        WHERE production.id IS NULL
    """,
    "legacy Production parts are fully mapped": """
        SELECT abs(
          (SELECT count(*) FROM production_parts) -
          (SELECT count(*) FROM generations generation
           JOIN productions production
             ON production.legacy_container_id = generation.project_id
           WHERE generation.version_of IS NULL
             AND coalesce(generation.kind, '') <> 'stitch')
        )
    """,
    "assets have canonical Venture ownership": """
        SELECT count(*) FROM assets asset
        LEFT JOIN ventures venture ON venture.id = asset.venture_id
        LEFT JOIN asset_collections collection ON collection.id = asset.collection_id
        WHERE venture.id IS NULL OR collection.id IS NULL
    """,
}


def main() -> int:
    failures = []
    with read_only() as cur:
        for label, query in CHECKS.items():
            cur.execute(query)
            problems = int(cur.fetchone()[0] or 0)
            passed = problems == 0
            print(f"{'PASS' if passed else 'FAIL'}  {label}" +
                  (f" — {problems} problem(s)" if problems else ""))
            if not passed:
                failures.append(label)
    print(f"\n{len(CHECKS) - len(failures)}/{len(CHECKS)} domain checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
