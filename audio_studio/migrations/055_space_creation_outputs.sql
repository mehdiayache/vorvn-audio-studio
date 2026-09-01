-- Standalone Speech and Subtitle executions now belong directly to a Space.
-- Development transcript rows are disposable and intentionally not backfilled.

ALTER TABLE transcripts
    ADD COLUMN IF NOT EXISTS space_id BIGINT REFERENCES spaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS transcripts_space_created_idx
    ON transcripts (space_id, created_at DESC)
    WHERE space_id IS NOT NULL;
