-- Bulk enrollment was never used by the product. Individual voice package
-- enrollment remains available through voice_package_jobs.
DROP TABLE IF EXISTS enrollment_campaign_items;
DROP TABLE IF EXISTS enrollment_campaigns;

DELETE FROM composer_working_drafts WHERE operation = 'new_take';
ALTER TABLE composer_working_drafts
    DROP CONSTRAINT IF EXISTS composer_working_drafts_check;
ALTER TABLE composer_working_drafts
    ADD CONSTRAINT composer_working_drafts_context_check CHECK (
        (context_kind = 'standalone' AND session_id IS NOT NULL
         AND production_id IS NULL AND part_id IS NULL AND operation IS NULL)
        OR
        (context_kind = 'production' AND session_id IS NULL
         AND production_id IS NOT NULL
         AND operation IN ('new_part', 'render_draft'))
    );
