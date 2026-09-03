#!/usr/bin/env python3
"""Read-only integrity gate for the canonical Origins domain.

Run from the repository root with ``python -m scripts.check_domain``.
"""

from origins.infrastructure.postgres.session import read_only


CHECKS = {
    "every Production belongs to a Workspace": """
        SELECT count(*) FROM productions production
        LEFT JOIN workspaces workspace ON workspace.id = production.workspace_id
        WHERE workspace.id IS NULL
    """,
    "nested Folders stay inside one Workspace": """
        SELECT count(*) FROM folders folder
        JOIN folders parent ON parent.id = folder.parent_id
        WHERE parent.workspace_id <> folder.workspace_id
    """,
    "every canonical Part belongs to an existing Production": """
        SELECT count(*) FROM production_parts part
        LEFT JOIN productions production ON production.id = part.production_id
        WHERE production.id IS NULL
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
    "every File belongs to a Workspace": """
        SELECT count(*) FROM files file
        LEFT JOIN workspaces workspace ON workspace.id = file.workspace_id
        WHERE workspace.id IS NULL
    """,
    "every FileVersion has physical storage identity": """
        SELECT count(*) FROM file_versions version
        WHERE version.mime_type IS NULL OR btrim(version.mime_type)=''
           OR version.storage_key IS NULL OR btrim(version.storage_key)=''
    """,
    "Creation output Files stay inside their Job Workspace": """
        SELECT count(*) FROM jobs job
         WHERE job.workspace_id IS NOT NULL
           AND EXISTS (
               SELECT 1 FROM unnest(job.output_file_ids) output(file_id)
               LEFT JOIN files file ON file.id=output.file_id
                WHERE file.id IS NULL OR file.workspace_id<>job.workspace_id
           )
    """,
    "Production Files stay inside their Production Workspace": """
        SELECT count(*) FROM production_file_usages usage
        JOIN productions production ON production.id = usage.production_id
        JOIN files file ON file.id = usage.file_id
        WHERE file.workspace_id <> production.workspace_id
    """,
    "Object Files stay inside their Object Workspace": """
        SELECT count(*) FROM object_file_usages usage
        JOIN objects object ON object.id = usage.object_id
        JOIN files file ON file.id = usage.file_id
        WHERE file.workspace_id <> object.workspace_id
    """,
    "standalone subtitle records keep their Job Workspace": """
        SELECT count(*) FROM transcripts transcript
        JOIN jobs job ON job.id=transcript.source_job_id
        WHERE job.creation_action_id='create-subtitles'
          AND transcript.part_id IS NULL
          AND transcript.workspace_id IS DISTINCT FROM job.workspace_id
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
