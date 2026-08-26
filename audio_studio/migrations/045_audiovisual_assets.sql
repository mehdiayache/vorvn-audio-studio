-- Assets remain one canonical library while their immutable versions gain
-- truthful audio, image or video technical facts.
ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'audio';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assets_media_type_check'
    ) THEN
        ALTER TABLE assets ADD CONSTRAINT assets_media_type_check
            CHECK (media_type IN ('audio', 'image', 'video'));
    END IF;
END $$;

ALTER TABLE asset_versions
    ADD COLUMN IF NOT EXISTS media_format TEXT,
    ADD COLUMN IF NOT EXISTS width INTEGER,
    ADD COLUMN IF NOT EXISTS height INTEGER,
    ADD COLUMN IF NOT EXISTS video_codec TEXT,
    ADD COLUMN IF NOT EXISTS frame_rate DOUBLE PRECISION;

UPDATE asset_versions
   SET media_format = audio_format
 WHERE media_format IS NULL AND audio_format IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'asset_versions_width_check'
    ) THEN
        ALTER TABLE asset_versions ADD CONSTRAINT asset_versions_width_check
            CHECK (width IS NULL OR width > 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'asset_versions_height_check'
    ) THEN
        ALTER TABLE asset_versions ADD CONSTRAINT asset_versions_height_check
            CHECK (height IS NULL OR height > 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'asset_versions_frame_rate_check'
    ) THEN
        ALTER TABLE asset_versions
            ADD CONSTRAINT asset_versions_frame_rate_check
            CHECK (frame_rate IS NULL OR frame_rate > 0);
    END IF;
END $$;
