-- Reusable visual reference sets belong to a Venture. They point at canonical
-- Assets; they never copy or re-own media.
CREATE TABLE IF NOT EXISTS saved_visual_references (
    id BIGSERIAL PRIMARY KEY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    venture_id BIGINT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    reference_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT saved_visual_references_name_check
        CHECK (length(trim(name)) BETWEEN 1 AND 120),
    CONSTRAINT saved_visual_references_type_check
        CHECK (reference_type IN (
            'character', 'object', 'place', 'style', 'other'
        ))
);

CREATE INDEX IF NOT EXISTS saved_visual_references_venture_idx
    ON saved_visual_references (venture_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS saved_visual_reference_assets (
    reference_id BIGINT NOT NULL
        REFERENCES saved_visual_references(id) ON DELETE CASCADE,
    asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (reference_id, asset_id),
    UNIQUE (reference_id, position),
    CONSTRAINT saved_visual_reference_assets_position_check
        CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS saved_visual_reference_assets_asset_idx
    ON saved_visual_reference_assets (asset_id);
