-- Separate immutable media identity from optional, human-owned classification.
-- `kind` remains as a compatibility column but now mirrors media_type only.
ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS category TEXT;

UPDATE assets
   SET category = kind
 WHERE media_type = 'audio'
   AND kind IN ('music', 'sfx', 'ambience')
   AND category IS NULL;

UPDATE assets SET kind = media_type;

ALTER TABLE assets
    DROP CONSTRAINT IF EXISTS assets_category_check;
ALTER TABLE assets
    ADD CONSTRAINT assets_category_check
    CHECK (category IS NULL OR category IN ('music', 'sfx', 'ambience'));

CREATE INDEX IF NOT EXISTS assets_category_idx
    ON assets(category) WHERE category IS NOT NULL;
