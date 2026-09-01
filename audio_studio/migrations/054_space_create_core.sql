-- Establish the Space/Create/File contract without disturbing the protected
-- audiovisual editor. Venture/Series compatibility is temporary and is
-- removed after the new Space routes and Project shell own every caller.

CREATE TABLE IF NOT EXISTS spaces (
    id          BIGINT PRIMARY KEY,
    public_id   UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO spaces (id, public_id, name, description, created_at, updated_at)
SELECT id, public_id, name, description, created_at, updated_at
  FROM ventures
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = EXCLUDED.updated_at;

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
    ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'audiovisual';

UPDATE productions production
   SET space_id = work_project.venture_id
  FROM work_projects work_project
 WHERE work_project.id = production.project_id
   AND production.space_id IS NULL;

ALTER TABLE productions
    ALTER COLUMN space_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS productions_space_updated_idx
    ON productions (space_id, updated_at DESC)
    WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS productions_folder_idx
    ON productions (folder_id, updated_at DESC)
    WHERE archived_at IS NULL;

ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS space_id BIGINT REFERENCES spaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS folder_id BIGINT REFERENCES folders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'uploaded';

UPDATE assets
   SET space_id = venture_id
 WHERE space_id IS NULL;

UPDATE assets
   SET source = CASE
       WHEN metadata->>'origin' = 'freesound' THEN 'freesound'
       WHEN legacy_generation_id IS NOT NULL THEN 'generated'
       ELSE 'uploaded'
   END;

ALTER TABLE assets
    ALTER COLUMN space_id SET NOT NULL;
ALTER TABLE assets
    DROP CONSTRAINT IF EXISTS assets_media_type_check;

CREATE UNIQUE INDEX IF NOT EXISTS assets_public_id_idx ON assets (public_id);
CREATE INDEX IF NOT EXISTS assets_space_updated_idx
    ON assets (space_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS assets_folder_idx
    ON assets (folder_id, updated_at DESC);

ALTER TABLE asset_versions
    ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS storage_key TEXT;

UPDATE asset_versions version
   SET mime_type = coalesce(nullif(version.mime_type, ''), 'application/octet-stream'),
       storage_key = coalesce(
           nullif(version.storage_key, ''),
           nullif(version.path, ''),
           'files/' || version.asset_id || '/versions/' || version.id || '/' || version.filename
       );

ALTER TABLE asset_versions
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

INSERT INTO project_files (project_id, file_id, purpose, created_at)
SELECT production_id, asset_id, 'media', created_at
  FROM production_director_assets
ON CONFLICT (project_id, file_id) DO NOTHING;

ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS space_id BIGINT REFERENCES spaces(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS creation_action_id TEXT,
    ADD COLUMN IF NOT EXISTS creation_preset_id TEXT,
    ADD COLUMN IF NOT EXISTS creation_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS output_file_ids BIGINT[] NOT NULL DEFAULT '{}';

UPDATE jobs job
   SET space_id = coalesce(
       job.venture_id,
       (SELECT production.space_id
          FROM productions production
         WHERE production.id = job.production_id)
   )
 WHERE job.space_id IS NULL;

CREATE INDEX IF NOT EXISTS jobs_space_created_idx
    ON jobs (space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_creation_action_idx
    ON jobs (creation_action_id, created_at DESC)
    WHERE creation_action_id IS NOT NULL;
