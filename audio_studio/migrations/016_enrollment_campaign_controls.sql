ALTER TABLE enrollment_campaign_items
    ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS enrollment_campaign_items_public_id_idx
    ON enrollment_campaign_items(public_id);

