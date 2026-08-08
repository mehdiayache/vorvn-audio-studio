"""Additive, idempotent migration to the canonical production domain.

Legacy rows remain in ``projects`` while browser and CLI clients migrate. IDs
for Ventures, Projects and Productions are deliberately preserved, so paid
audio, bookmarks and old API calls keep pointing at the same work.
"""

DOMAIN_SCHEMA = r"""
CREATE TABLE IF NOT EXISTS ventures (
    id          BIGINT PRIMARY KEY,
    public_id   UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    slug        TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon        TEXT NOT NULL DEFAULT '',
    naming      JSONB NOT NULL DEFAULT '{}'::jsonb,
    style_prompt TEXT NOT NULL DEFAULT '',
    settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
    system_role TEXT,
    locked      BOOLEAN NOT NULL DEFAULT false,
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS work_projects (
    id          BIGINT PRIMARY KEY,
    public_id   UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    venture_id  BIGINT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon        TEXT NOT NULL DEFAULT '',
    cover_image TEXT NOT NULL DEFAULT '',
    settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (venture_id, slug)
);
CREATE INDEX IF NOT EXISTS work_projects_venture_idx
    ON work_projects (venture_id, updated_at DESC);

-- Projects use editorial cover artwork. ``icon`` remains as a compatibility
-- bridge for legacy containers; new clients read and write ``cover_image``.
ALTER TABLE work_projects ADD COLUMN IF NOT EXISTS cover_image TEXT NOT NULL DEFAULT '';
UPDATE work_projects SET cover_image = icon
 WHERE cover_image = '' AND icon <> '';

CREATE TABLE IF NOT EXISTS series (
    id          BIGSERIAL PRIMARY KEY,
    public_id   UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    project_id  BIGINT NOT NULL REFERENCES work_projects(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon        TEXT NOT NULL DEFAULT '',
    defaults    JSONB NOT NULL DEFAULT '{}'::jsonb,
    position    INTEGER,
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, slug)
);
CREATE INDEX IF NOT EXISTS series_project_idx
    ON series (project_id, position NULLS LAST, updated_at DESC);

CREATE TABLE IF NOT EXISTS productions (
    id                  BIGINT PRIMARY KEY,
    public_id           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    project_id          BIGINT NOT NULL REFERENCES work_projects(id) ON DELETE CASCADE,
    series_id           BIGINT REFERENCES series(id) ON DELETE SET NULL,
    legacy_container_id BIGINT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    slug                TEXT NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','in_progress','review','approved','released','archived')),
    position            INTEGER,
    settings            JSONB NOT NULL DEFAULT '{}'::jsonb,
    archived_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, slug)
);
CREATE INDEX IF NOT EXISTS productions_project_idx
    ON productions (project_id, position NULLS LAST, updated_at DESC);
CREATE INDEX IF NOT EXISTS productions_series_idx
    ON productions (series_id, position NULLS LAST, updated_at DESC);

-- A nullable composite relationship is the database-level guarantee that a
-- Production can only join a Series owned by the same Project. Application
-- validation remains useful for a friendly error, but cannot replace this.
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE productions DROP CONSTRAINT IF EXISTS productions_series_project_fkey;
ALTER TABLE series DROP CONSTRAINT IF EXISTS series_id_project_unique;
ALTER TABLE series ADD CONSTRAINT series_id_project_unique UNIQUE (id, project_id);
ALTER TABLE productions ADD CONSTRAINT productions_series_project_fkey
    FOREIGN KEY (series_id, project_id) REFERENCES series(id, project_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS asset_collections (
    id                  BIGINT PRIMARY KEY,
    venture_id          BIGINT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
    legacy_container_id BIGINT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    kind                TEXT NOT NULL CHECK (kind IN ('intros','outros','music','stingers','other')),
    name                TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (venture_id, kind)
);

CREATE TABLE IF NOT EXISTS production_parts (
    generation_id BIGINT PRIMARY KEY REFERENCES generations(id) ON DELETE CASCADE,
    production_id BIGINT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    position      INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (production_id, position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS production_parts_production_idx
    ON production_parts (production_id, position NULLS LAST);

CREATE TABLE IF NOT EXISTS production_mixes (
    production_id BIGINT PRIMARY KEY REFERENCES productions(id) ON DELETE CASCADE,
    music_asset_id BIGINT REFERENCES assets(id) ON DELETE SET NULL,
    level          TEXT NOT NULL DEFAULT 'discreet',
    volume         REAL NOT NULL DEFAULT 0.10,
    start_seconds  REAL NOT NULL DEFAULT 0,
    fade_in_seconds REAL NOT NULL DEFAULT 2,
    fade_out_seconds REAL NOT NULL DEFAULT 4,
    duck           BOOLEAN NOT NULL DEFAULT true,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE generations ADD COLUMN IF NOT EXISTS production_id BIGINT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS venture_id BIGINT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS production_id BIGINT;

INSERT INTO ventures
    (id, slug, name, description, icon, naming, style_prompt, system_role,
     locked, created_at, updated_at)
SELECT p.id,
       trim(both '-' from regexp_replace(lower(p.name), '[^a-z0-9]+', '-', 'g')) || '-' || p.id,
       p.name, coalesce(p.description, ''), coalesce(p.icon, ''),
       coalesce(p.naming, '{}'::jsonb), coalesce(p.style_prompt, ''),
       p.system_role, p.locked, p.created_at, p.updated_at
  FROM projects p
 WHERE p.container_type = 'venture'
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description,
    icon = EXCLUDED.icon, naming = EXCLUDED.naming,
    style_prompt = EXCLUDED.style_prompt, system_role = EXCLUDED.system_role,
    locked = EXCLUDED.locked, updated_at = EXCLUDED.updated_at;

INSERT INTO work_projects
    (id, venture_id, slug, name, description, icon, created_at, updated_at)
SELECT p.id, p.parent_id,
       trim(both '-' from regexp_replace(lower(p.name), '[^a-z0-9]+', '-', 'g')) || '-' || p.id,
       p.name, coalesce(p.description, ''), coalesce(p.icon, ''),
       p.created_at, p.updated_at
  FROM projects p
  JOIN ventures v ON v.id = p.parent_id
 WHERE p.container_type = 'project'
ON CONFLICT (id) DO UPDATE SET
    venture_id = EXCLUDED.venture_id, name = EXCLUDED.name,
    description = EXCLUDED.description, icon = EXCLUDED.icon,
    updated_at = EXCLUDED.updated_at;

INSERT INTO productions
    (id, project_id, legacy_container_id, slug, name, description,
     created_at, updated_at)
SELECT p.id, p.parent_id, p.id,
       trim(both '-' from regexp_replace(lower(p.name), '[^a-z0-9]+', '-', 'g')) || '-' || p.id,
       p.name, coalesce(p.description, ''), p.created_at, p.updated_at
  FROM projects p
  JOIN work_projects project ON project.id = p.parent_id
 WHERE p.container_type = 'production'
ON CONFLICT (id) DO UPDATE SET
    project_id = EXCLUDED.project_id,
    description = EXCLUDED.description,
    updated_at = EXCLUDED.updated_at;

-- User-confirmed editorial split: the legacy title flattened a Series and its
-- first Production into one folder name. This is intentionally exact rather
-- than a punctuation heuristic that could corrupt titles such as "Ep 3 — …".
INSERT INTO series (project_id, slug, name, description)
SELECT project_id, 'christian-prayer', 'Christian prayer',
       'Prayer-based sleeping guides.'
  FROM productions
 WHERE id = 6 AND name = 'Christian prayer — falling asleep'
ON CONFLICT (project_id, slug) DO NOTHING;

UPDATE productions production
   SET series_id = s.id, name = 'Falling asleep', slug = 'falling-asleep-6'
  FROM series s
 WHERE production.id = 6
   AND s.project_id = production.project_id
   AND s.slug = 'christian-prayer';

INSERT INTO asset_collections (id, venture_id, legacy_container_id, kind, name)
SELECT collection.id, library.parent_id, collection.id,
       CASE lower(collection.name)
         WHEN 'intros' THEN 'intros' WHEN 'outros' THEN 'outros'
         WHEN 'music' THEN 'music' WHEN 'stingers' THEN 'stingers'
         ELSE 'other' END,
       collection.name
  FROM projects collection
  JOIN projects library ON library.id = collection.parent_id
  JOIN ventures venture ON venture.id = library.parent_id
 WHERE collection.container_type = 'asset_collection'
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind;

UPDATE generations generation
   SET production_id = production.id
  FROM productions production
 WHERE generation.project_id = production.legacy_container_id
   AND generation.production_id IS DISTINCT FROM production.id;

INSERT INTO production_parts (generation_id, production_id, position)
SELECT generation.id, generation.production_id, generation.position
  FROM generations generation
 WHERE generation.production_id IS NOT NULL AND generation.version_of IS NULL
   AND coalesce(generation.kind, '') <> 'stitch'
ON CONFLICT (generation_id) DO UPDATE SET
    production_id = EXCLUDED.production_id, position = EXCLUDED.position;

INSERT INTO production_mixes
    (production_id, music_asset_id, level, volume, start_seconds,
     fade_in_seconds, fade_out_seconds, duck)
SELECT production.id, asset.id, legacy.music_level,
       coalesce(legacy.music_volume,
                CASE legacy.music_level WHEN 'present' THEN .20 WHEN 'loud' THEN .34 ELSE .10 END),
       coalesce(legacy.music_start, 0), legacy.music_fade_in,
       legacy.music_fade_out, legacy.music_duck
  FROM productions production
  JOIN projects legacy ON legacy.id = production.legacy_container_id
  LEFT JOIN assets asset ON asset.legacy_generation_id = legacy.music_of
ON CONFLICT (production_id) DO UPDATE SET
    music_asset_id = EXCLUDED.music_asset_id, level = EXCLUDED.level,
    volume = EXCLUDED.volume, start_seconds = EXCLUDED.start_seconds,
    fade_in_seconds = EXCLUDED.fade_in_seconds,
    fade_out_seconds = EXCLUDED.fade_out_seconds, duck = EXCLUDED.duck;

UPDATE jobs job SET production_id = production.id, venture_id = project.venture_id
  FROM productions production
  JOIN work_projects project ON project.id = production.project_id
 WHERE job.project_id = production.legacy_container_id
   AND (job.production_id IS DISTINCT FROM production.id
        OR job.venture_id IS DISTINCT FROM project.venture_id);

ALTER TABLE generations DROP CONSTRAINT IF EXISTS generations_production_id_fkey;
ALTER TABLE generations ADD CONSTRAINT generations_production_id_fkey
    FOREIGN KEY (production_id) REFERENCES productions(id) ON DELETE SET NULL;
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_venture_id_fkey;
ALTER TABLE jobs ADD CONSTRAINT jobs_venture_id_fkey
    FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE SET NULL;
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_production_id_fkey;
ALTER TABLE jobs ADD CONSTRAINT jobs_production_id_fkey
    FOREIGN KEY (production_id) REFERENCES productions(id) ON DELETE SET NULL;

ALTER TABLE exports DROP CONSTRAINT IF EXISTS exports_production_id_fkey;
ALTER TABLE exports ADD CONSTRAINT exports_production_id_fkey
    FOREIGN KEY (production_id) REFERENCES productions(id) ON DELETE CASCADE;

-- Assets now belong to a real Venture and Collection. The legacy hierarchy
-- rows retain the same IDs, so this rewires ownership without rewriting data.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_venture_id_fkey;
ALTER TABLE assets ADD CONSTRAINT assets_venture_id_fkey
    FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_collection_id_fkey;
ALTER TABLE assets ADD CONSTRAINT assets_collection_id_fkey
    FOREIGN KEY (collection_id) REFERENCES asset_collections(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION sync_generation_domain() RETURNS trigger AS $$
DECLARE canonical_id BIGINT;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT id INTO canonical_id FROM productions
     WHERE legacy_container_id = NEW.project_id;
  END IF;
  NEW.production_id := canonical_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS generations_domain_before ON generations;
CREATE TRIGGER generations_domain_before
BEFORE INSERT OR UPDATE OF project_id ON generations
FOR EACH ROW EXECUTE FUNCTION sync_generation_domain();

CREATE OR REPLACE FUNCTION sync_production_part_domain() RETURNS trigger AS $$
BEGIN
  IF NEW.production_id IS NOT NULL AND NEW.version_of IS NULL
     AND coalesce(NEW.kind, '') <> 'stitch' THEN
    INSERT INTO production_parts (generation_id, production_id, position)
    VALUES (NEW.id, NEW.production_id, NEW.position)
    ON CONFLICT (generation_id) DO UPDATE SET
      production_id = EXCLUDED.production_id, position = EXCLUDED.position;
  ELSE
    DELETE FROM production_parts WHERE generation_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS generations_part_after ON generations;
CREATE TRIGGER generations_part_after
AFTER INSERT OR UPDATE OF production_id, version_of, kind, position ON generations
FOR EACH ROW EXECUTE FUNCTION sync_production_part_domain();

CREATE OR REPLACE FUNCTION sync_job_domain() RETURNS trigger AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT production.id, project.venture_id
      INTO NEW.production_id, NEW.venture_id
      FROM productions production
      JOIN work_projects project ON project.id = production.project_id
     WHERE production.legacy_container_id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS jobs_domain_before ON jobs;
CREATE TRIGGER jobs_domain_before
BEFORE INSERT OR UPDATE OF project_id ON jobs
FOR EACH ROW EXECUTE FUNCTION sync_job_domain();

CREATE OR REPLACE FUNCTION sync_legacy_container_domain() RETURNS trigger AS $$
DECLARE
  canonical_slug TEXT;
  name_changed BOOLEAN := true;
  description_changed BOOLEAN := true;
  icon_changed BOOLEAN := true;
BEGIN
  canonical_slug := trim(both '-' from regexp_replace(lower(NEW.name), '[^a-z0-9]+', '-', 'g')) || '-' || NEW.id;
  IF TG_OP = 'UPDATE' THEN
    name_changed := OLD.name IS DISTINCT FROM NEW.name;
    description_changed := OLD.description IS DISTINCT FROM NEW.description;
    icon_changed := OLD.icon IS DISTINCT FROM NEW.icon;
  END IF;
  IF NEW.container_type = 'venture' THEN
    INSERT INTO ventures
      (id, slug, name, description, icon, naming, style_prompt,
       system_role, locked, created_at, updated_at)
    VALUES
      (NEW.id, canonical_slug, NEW.name, coalesce(NEW.description, ''),
       coalesce(NEW.icon, ''), coalesce(NEW.naming, '{}'::jsonb),
       coalesce(NEW.style_prompt, ''), NEW.system_role, NEW.locked,
       NEW.created_at, NEW.updated_at)
    ON CONFLICT (id) DO UPDATE SET
      name = CASE WHEN name_changed THEN NEW.name ELSE ventures.name END,
      description = CASE WHEN description_changed THEN coalesce(NEW.description, '') ELSE ventures.description END,
      icon = CASE WHEN icon_changed THEN coalesce(NEW.icon, '') ELSE ventures.icon END,
      naming = coalesce(NEW.naming, '{}'::jsonb), style_prompt = coalesce(NEW.style_prompt, ''),
      system_role = NEW.system_role, locked = NEW.locked, updated_at = NEW.updated_at;
  ELSIF NEW.container_type = 'project'
        AND EXISTS (SELECT 1 FROM ventures WHERE id = NEW.parent_id) THEN
    INSERT INTO work_projects
      (id, venture_id, slug, name, description, icon, created_at, updated_at)
    VALUES
      (NEW.id, NEW.parent_id, canonical_slug, NEW.name,
       coalesce(NEW.description, ''), coalesce(NEW.icon, ''),
       NEW.created_at, NEW.updated_at)
    ON CONFLICT (id) DO UPDATE SET
      venture_id = NEW.parent_id,
      name = CASE WHEN name_changed THEN NEW.name ELSE work_projects.name END,
      description = CASE WHEN description_changed THEN coalesce(NEW.description, '') ELSE work_projects.description END,
      icon = CASE WHEN icon_changed THEN coalesce(NEW.icon, '') ELSE work_projects.icon END,
      updated_at = NEW.updated_at;
  ELSIF NEW.container_type = 'production'
        AND EXISTS (SELECT 1 FROM work_projects WHERE id = NEW.parent_id) THEN
    INSERT INTO productions
      (id, project_id, legacy_container_id, slug, name, description,
       created_at, updated_at)
    VALUES
      (NEW.id, NEW.parent_id, NEW.id, canonical_slug, NEW.name,
       coalesce(NEW.description, ''), NEW.created_at, NEW.updated_at)
    ON CONFLICT (id) DO UPDATE SET
      project_id = NEW.parent_id,
      series_id = CASE WHEN productions.project_id IS DISTINCT FROM NEW.parent_id THEN NULL ELSE productions.series_id END,
      name = CASE WHEN name_changed THEN NEW.name ELSE productions.name END,
      description = CASE WHEN description_changed THEN coalesce(NEW.description, '') ELSE productions.description END,
      updated_at = NEW.updated_at;
    INSERT INTO production_mixes (production_id) VALUES (NEW.id)
    ON CONFLICT (production_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS legacy_container_domain_after ON projects;
CREATE TRIGGER legacy_container_domain_after
AFTER INSERT OR UPDATE OF parent_id, name, description, icon, naming,
  style_prompt, locked, container_type, system_role ON projects
FOR EACH ROW EXECUTE FUNCTION sync_legacy_container_domain();

CREATE OR REPLACE FUNCTION delete_legacy_container_domain() RETURNS trigger AS $$
BEGIN
  IF OLD.container_type = 'production' THEN
    DELETE FROM productions WHERE id = OLD.id;
  ELSIF OLD.container_type = 'project' THEN
    DELETE FROM work_projects WHERE id = OLD.id;
  ELSIF OLD.container_type = 'venture' THEN
    DELETE FROM ventures WHERE id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS legacy_container_domain_delete ON projects;
CREATE TRIGGER legacy_container_domain_delete
AFTER DELETE ON projects
FOR EACH ROW EXECUTE FUNCTION delete_legacy_container_domain();
"""


def migrate(cursor) -> None:
    """Apply the canonical schema using the caller's transaction."""
    cursor.execute(DOMAIN_SCHEMA)
