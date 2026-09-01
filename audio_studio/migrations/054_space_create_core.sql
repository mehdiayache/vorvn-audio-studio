-- Establish the final Space/Create/File ownership contract. Pre-production
-- state is disposable: this migration deliberately does not copy Ventures,
-- legacy Projects, Asset collections, or their temporary relationships.

CREATE TABLE IF NOT EXISTS spaces (
    id          BIGSERIAL PRIMARY KEY,
    public_id   UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS folders (
    id          BIGSERIAL PRIMARY KEY,
    public_id   UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    space_id    BIGINT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    parent_id   BIGINT REFERENCES folders(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS folders_space_parent_idx
    ON folders (space_id, parent_id, name);

ALTER TABLE productions
    ADD COLUMN IF NOT EXISTS space_id BIGINT REFERENCES spaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS folder_id BIGINT REFERENCES folders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'legacy_work';

ALTER TABLE productions DROP CONSTRAINT IF EXISTS productions_project_type_check;
ALTER TABLE productions ADD CONSTRAINT productions_project_type_check
    CHECK (project_type IN ('audiovisual', 'legacy_work'));

-- The audiovisual Project is now a direct Space child. Old Work rows remain
-- readable until their screens are removed, but they are not parents of new
-- Projects and nothing mirrors them into Spaces.
ALTER TABLE productions DROP CONSTRAINT IF EXISTS productions_series_project_fkey;
ALTER TABLE productions ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE productions ALTER COLUMN legacy_container_id DROP NOT NULL;
CREATE SEQUENCE IF NOT EXISTS productions_id_seq;
SELECT setval(
    'productions_id_seq',
    greatest(coalesce((SELECT max(id) FROM productions), 0), 1),
    coalesce((SELECT max(id) FROM productions), 0) > 0
);
ALTER SEQUENCE productions_id_seq OWNED BY productions.id;
ALTER TABLE productions ALTER COLUMN id SET DEFAULT nextval('productions_id_seq');

CREATE INDEX IF NOT EXISTS productions_space_updated_idx
    ON productions (space_id, updated_at DESC)
    WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS productions_space_slug_key
    ON productions (space_id, slug)
    WHERE space_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS productions_folder_idx
    ON productions (folder_id, updated_at DESC)
    WHERE archived_at IS NULL;

ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS space_id BIGINT REFERENCES spaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS folder_id BIGINT REFERENCES folders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'uploaded';

ALTER TABLE assets ALTER COLUMN venture_id DROP NOT NULL;
ALTER TABLE assets ALTER COLUMN collection_id DROP NOT NULL;
ALTER TABLE assets
    DROP CONSTRAINT IF EXISTS assets_media_type_check;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_scope_check;
ALTER TABLE assets ADD CONSTRAINT assets_scope_check
    CHECK (scope IN ('space', 'studio'));
ALTER TABLE assets ALTER COLUMN scope SET DEFAULT 'space';

CREATE UNIQUE INDEX IF NOT EXISTS assets_public_id_idx ON assets (public_id);
CREATE INDEX IF NOT EXISTS assets_space_updated_idx
    ON assets (space_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS assets_folder_idx
    ON assets (folder_id, updated_at DESC);

ALTER TABLE asset_versions
    ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS storage_key TEXT;

ALTER TABLE asset_versions
    ALTER COLUMN mime_type SET DEFAULT 'application/octet-stream',
    ALTER COLUMN mime_type SET NOT NULL,
    ALTER COLUMN storage_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS asset_versions_public_id_idx
    ON asset_versions (public_id);

CREATE TABLE IF NOT EXISTS project_files (
    project_id  BIGINT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    file_id     BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    purpose     TEXT NOT NULL DEFAULT 'media',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, file_id)
);
CREATE INDEX IF NOT EXISTS project_files_file_idx
    ON project_files (file_id, created_at DESC);

ALTER TABLE saved_visual_references
    ADD COLUMN IF NOT EXISTS space_id BIGINT REFERENCES spaces(id) ON DELETE CASCADE;
ALTER TABLE saved_visual_references ALTER COLUMN venture_id DROP NOT NULL;
ALTER TABLE saved_visual_references
    DROP CONSTRAINT IF EXISTS saved_visual_references_owner_check;
ALTER TABLE saved_visual_references
    ADD CONSTRAINT saved_visual_references_owner_check
    CHECK (num_nonnulls(space_id, venture_id) = 1);
CREATE INDEX IF NOT EXISTS saved_visual_references_space_idx
    ON saved_visual_references (space_id, updated_at DESC, id DESC);

ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS space_id BIGINT REFERENCES spaces(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS creation_action_id TEXT,
    ADD COLUMN IF NOT EXISTS creation_preset_id TEXT,
    ADD COLUMN IF NOT EXISTS creation_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS output_file_ids BIGINT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS jobs_space_created_idx
    ON jobs (space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_creation_action_idx
    ON jobs (creation_action_id, created_at DESC)
    WHERE creation_action_id IS NOT NULL;
