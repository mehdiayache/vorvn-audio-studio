-- Director collects reusable visual Assets for one Production without
-- creating placements. VisualScene remains the later placement truth.
CREATE TABLE IF NOT EXISTS production_director_assets (
    production_id BIGINT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (production_id, asset_id)
);

CREATE INDEX IF NOT EXISTS production_director_assets_asset_idx
    ON production_director_assets (asset_id);
