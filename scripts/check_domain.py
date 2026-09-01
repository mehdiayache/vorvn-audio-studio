#!/usr/bin/env python3
"""Read-only integrity gate for the canonical Studio domain.

Run from the repository root with ``python -m scripts.check_domain``.
"""

from audio_studio.infrastructure.postgres.session import read_only


CHECKS = {
    "legacy Series placement never crosses its Work Project": """
        SELECT count(*) FROM productions production
        JOIN series ON series.id = production.series_id
        WHERE production.project_id IS NULL
           OR series.project_id <> production.project_id
    """,
    "every audiovisual Project is owned only by a Space": """
        SELECT count(*) FROM productions project
        LEFT JOIN spaces space ON space.id = project.space_id
        WHERE project.project_type = 'audiovisual'
          AND (space.id IS NULL OR project.project_id IS NOT NULL
               OR project.legacy_container_id IS NOT NULL)
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
    "every recording Clip belongs to a canonical Part": """
        SELECT count(*) FROM clips clip
        LEFT JOIN production_parts part ON part.id=clip.part_id
        WHERE part.id IS NULL
    """,
    "Clip revisions never come from the future": """
        SELECT count(*) FROM clips clip
        JOIN production_parts part ON part.id=clip.part_id
        WHERE clip.source_part_revision>part.revision
    """,
    "enrollment Jobs persist an exact execution adapter": """
        SELECT count(*) FROM voice_package_jobs
         WHERE adapter_key IS NULL OR btrim(adapter_key)=''
    """,
    "active enrollment Jobs persist one complete exact route": """
        SELECT count(*) FROM voice_package_jobs
         WHERE status IN ('queued','creating')
           AND (provider IS NULL OR btrim(provider)=''
             OR provider_region IS NULL OR btrim(provider_region)=''
             OR provider_model_id IS NULL
             OR adapter_key IS NULL OR btrim(adapter_key)='')
    """,
    "preferred Voice References belong to their Voice Identity": """
        SELECT count(*) FROM voice_identities identity
        JOIN voice_references reference
          ON reference.id=identity.preferred_reference_id
        WHERE reference.identity_id<>identity.id
    """,
    "legacy Assets keep internally complete ownership": """
        SELECT count(*) FROM assets asset
        LEFT JOIN ventures venture ON venture.id = asset.venture_id
        LEFT JOIN asset_collections collection ON collection.id = asset.collection_id
        WHERE asset.space_id IS NULL
          AND (venture.id IS NULL OR collection.id IS NULL)
    """,
    "every File belongs to a Space": """
        SELECT count(*) FROM assets file
        LEFT JOIN spaces space ON space.id = file.space_id
        WHERE space.id IS NULL
    """,
    "every FileVersion has physical storage identity": """
        SELECT count(*) FROM asset_versions version
        WHERE version.mime_type IS NULL OR btrim(version.mime_type)=''
           OR version.storage_key IS NULL OR btrim(version.storage_key)=''
    """,
    "Creation output Files stay inside their Job Space": """
        SELECT count(*) FROM jobs job
         WHERE job.space_id IS NOT NULL
           AND EXISTS (
               SELECT 1 FROM unnest(job.output_file_ids) output(file_id)
               LEFT JOIN assets file ON file.id=output.file_id
                WHERE file.id IS NULL OR file.space_id<>job.space_id
           )
    """,
    "standalone subtitle records keep their Job Space": """
        SELECT count(*) FROM transcripts transcript
        JOIN jobs job ON job.id=transcript.source_job_id
        WHERE job.creation_action_id='create-subtitles'
          AND transcript.part_id IS NULL
          AND transcript.space_id IS DISTINCT FROM job.space_id
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
