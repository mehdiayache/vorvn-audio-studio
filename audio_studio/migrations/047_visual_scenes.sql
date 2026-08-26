-- Visual placements are an independent Production truth. SoundScene remains
-- the specialized audio document; both will share one Timeline timebase.
CREATE TABLE visual_scenes (
    production_id BIGINT PRIMARY KEY
        REFERENCES productions(id) ON DELETE CASCADE,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    document JSONB NOT NULL DEFAULT '{"version":1,"tracks":[]}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(document) = 'object')
);

INSERT INTO visual_scenes (production_id)
SELECT id FROM productions
ON CONFLICT (production_id) DO NOTHING;
