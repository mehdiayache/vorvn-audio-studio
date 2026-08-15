-- Speech has one human action: create a standalone recording or record one
-- existing Production Part. Remove operation variants that duplicated Part
-- truth, and remove the same redundancy from recoverable Composer state.
UPDATE jobs
   SET payload = jsonb_set(payload, '{operation}', '"record"'::jsonb)
 WHERE kind = 'speech'
   AND payload->>'operation' IN ('record_part', 'render_draft');

UPDATE composer_working_drafts
   SET context_key = 'production:' || production_id || ':part:' || part_id
 WHERE context_kind = 'production'
   AND part_id IS NOT NULL;

ALTER TABLE composer_working_drafts
    DROP CONSTRAINT IF EXISTS composer_working_drafts_context_check;

ALTER TABLE composer_working_drafts
    DROP COLUMN IF EXISTS operation;

ALTER TABLE composer_working_drafts
    ADD CONSTRAINT composer_working_drafts_context_check CHECK (
        (context_kind = 'standalone' AND session_id IS NOT NULL
         AND production_id IS NULL AND part_id IS NULL
         AND insert_before_part_public_id IS NULL)
        OR
        (context_kind = 'production' AND session_id IS NULL
         AND production_id IS NOT NULL
         AND (part_id IS NULL OR insert_before_part_public_id IS NULL))
    );
