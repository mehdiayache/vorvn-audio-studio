#!/usr/bin/env python3
"""Read-only integrity gate for the canonical Studio domain.

Run from the repository root with ``python -m scripts.check_domain``.
"""

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
    "historical Part provenance is honest when present": """
        SELECT count(*) FROM production_parts part
         WHERE part.legacy_generation_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM generations generation
                            WHERE generation.id=part.legacy_generation_id)
    """,
    "selected Takes belong to their canonical Part": """
        SELECT count(*) FROM production_parts part
        JOIN takes take ON take.id=part.selected_take_id
        WHERE take.part_id<>part.id
    """,
    "Take revisions never come from the future": """
        SELECT count(*) FROM takes take
        JOIN production_parts part ON part.id=take.part_id
        WHERE take.source_part_revision>part.revision
    """,
    "enrollment Jobs persist an exact execution adapter": """
        SELECT count(*) FROM voice_package_jobs
         WHERE adapter_key IS NULL OR btrim(adapter_key)=''
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
