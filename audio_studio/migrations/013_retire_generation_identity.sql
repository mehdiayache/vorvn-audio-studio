-- Generation is preserved only as migration provenance. It is no longer a
-- live Part, Take, Job, Transcript, or Export identity.
DROP TRIGGER IF EXISTS generations_part_after ON generations;
DROP FUNCTION IF EXISTS sync_production_part_domain();
DROP TRIGGER IF EXISTS generations_domain_before ON generations;
DROP FUNCTION IF EXISTS sync_generation_domain();

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='production_parts' AND column_name='generation_id') THEN
        ALTER TABLE production_parts RENAME COLUMN generation_id TO legacy_generation_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transcripts' AND column_name='generation_id') THEN
        ALTER TABLE transcripts RENAME COLUMN generation_id TO legacy_generation_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='generation_id') THEN
        ALTER TABLE jobs RENAME COLUMN generation_id TO legacy_generation_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exports' AND column_name='generation_id') THEN
        ALTER TABLE exports RENAME COLUMN generation_id TO legacy_generation_id;
    END IF;
END $$;

COMMENT ON COLUMN production_parts.legacy_generation_id IS 'Historical migration provenance only; never a Part identity.';
COMMENT ON COLUMN transcripts.legacy_generation_id IS 'Historical migration provenance only; new transcripts use Part/Take IDs.';
COMMENT ON COLUMN jobs.legacy_generation_id IS 'Historical migration provenance only; new Jobs use Part/Take IDs.';
COMMENT ON COLUMN exports.legacy_generation_id IS 'Historical migration provenance only; exports are standalone immutable records.';
