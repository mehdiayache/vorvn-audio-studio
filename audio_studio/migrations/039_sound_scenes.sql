CREATE TABLE sound_scenes (
    production_id     BIGINT PRIMARY KEY REFERENCES productions(id) ON DELETE CASCADE,
    revision          BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    document          JSONB NOT NULL,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(document) = 'object')
);

CREATE TABLE sound_scene_history (
    production_id     BIGINT NOT NULL REFERENCES sound_scenes(production_id) ON DELETE CASCADE,
    revision          BIGINT NOT NULL CHECK (revision > 0),
    document          JSONB NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (production_id, revision),
    CHECK (jsonb_typeof(document) = 'object')
);

INSERT INTO sound_scenes (production_id, revision, document)
SELECT production.id,
       1,
       jsonb_build_object(
           'version', 1,
           'tracks', jsonb_build_array(jsonb_build_object(
               'id', 'music',
               'kind', 'music',
               'name', 'Music',
               'muted', false,
               'clips', CASE
                   WHEN mix.music_asset_id IS NULL THEN '[]'::jsonb
                   ELSE jsonb_build_array(jsonb_build_object(
                       'id', gen_random_uuid()::text,
                       'asset_id', mix.music_asset_id,
                       'asset_version_id', version.id,
                       'start_ms', 0,
                       'duration_ms', NULL,
                       'source_offset_ms', round(greatest(0, mix.start_seconds) * 1000)::bigint,
                       'gain', greatest(0, least(2, coalesce(mix.volume, .10))),
                       'fade_in_ms', round(greatest(0, mix.fade_in_seconds) * 1000)::bigint,
                       'fade_out_ms', round(greatest(0, mix.fade_out_seconds) * 1000)::bigint,
                       'loop', true,
                       'ducking', coalesce(mix.duck, true),
                       'anchor', jsonb_build_object(
                           'kind', 'absolute',
                           'position_ms', 0
                       )
                   ))
               END
           ))
       )
  FROM productions production
  LEFT JOIN production_mixes mix ON mix.production_id = production.id
  LEFT JOIN LATERAL (
      SELECT item.id
        FROM asset_versions item
       WHERE item.asset_id = mix.music_asset_id
       ORDER BY item.version DESC
       LIMIT 1
  ) version ON true;

INSERT INTO sound_scene_history (production_id, revision, document)
SELECT production_id, revision, document FROM sound_scenes;

DROP TABLE production_mixes;

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
    INSERT INTO sound_scenes (production_id, document)
    VALUES (NEW.id, '{"version":1,"tracks":[{"id":"music","kind":"music","name":"Music","muted":false,"clips":[]}]}'::jsonb)
    ON CONFLICT (production_id) DO NOTHING;
    INSERT INTO sound_scene_history (production_id, revision, document)
    SELECT production_id, revision, document FROM sound_scenes
     WHERE production_id = NEW.id
    ON CONFLICT (production_id, revision) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE projects
    DROP COLUMN IF EXISTS music_of,
    DROP COLUMN IF EXISTS music_level,
    DROP COLUMN IF EXISTS music_fade_in,
    DROP COLUMN IF EXISTS music_fade_out,
    DROP COLUMN IF EXISTS music_duck,
    DROP COLUMN IF EXISTS music_volume,
    DROP COLUMN IF EXISTS music_start;
