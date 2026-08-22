-- Audio Library truth belongs to the existing Asset / AssetVersion model.
-- Asset kind is classification; scope controls reuse without changing owner.
ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'venture',
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE assets
   SET kind = CASE lower(kind)
       WHEN 'intros' THEN 'intro'
       WHEN 'outros' THEN 'outro'
       WHEN 'stingers' THEN 'sfx'
       WHEN 'sound_effects' THEN 'sfx'
       ELSE lower(kind)
   END;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assets_scope_check'
    ) THEN
        ALTER TABLE assets ADD CONSTRAINT assets_scope_check
            CHECK (scope IN ('venture', 'studio'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS assets_scope_updated_idx
    ON assets (scope, updated_at DESC);
CREATE INDEX IF NOT EXISTS assets_tags_idx
    ON assets USING gin (tags);

ALTER TABLE asset_versions
    ADD COLUMN IF NOT EXISTS audio_format TEXT,
    ADD COLUMN IF NOT EXISTS sample_rate INTEGER,
    ADD COLUMN IF NOT EXISTS channels SMALLINT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE asset_versions
   SET audio_format = lower(substring(filename from '\\.([^.]*)$'))
 WHERE audio_format IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'asset_versions_sample_rate_check'
    ) THEN
        ALTER TABLE asset_versions
            ADD CONSTRAINT asset_versions_sample_rate_check
            CHECK (sample_rate IS NULL OR sample_rate > 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'asset_versions_channels_check'
    ) THEN
        ALTER TABLE asset_versions
            ADD CONSTRAINT asset_versions_channels_check
            CHECK (channels IS NULL OR channels > 0);
    END IF;
END $$;
