-- Canonical empty-database baseline extracted before deleting db.py.
-- It is intentionally idempotent for existing installations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS generations (
    id           BIGSERIAL PRIMARY KEY,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    text         TEXT        NOT NULL,
    voice        TEXT        NOT NULL,
    model        TEXT        NOT NULL,
    format       TEXT        NOT NULL,
    language     TEXT,
    instruction  TEXT,
    rate         REAL        NOT NULL DEFAULT 1,
    pitch        REAL        NOT NULL DEFAULT 1,
    volume       INTEGER     NOT NULL DEFAULT 50,
    seed         INTEGER     NOT NULL DEFAULT 0,
    filename     TEXT        NOT NULL,
    path         TEXT        NOT NULL,
    size_bytes   BIGINT      NOT NULL DEFAULT 0,
    chars        INTEGER     NOT NULL DEFAULT 0,
    requests     INTEGER     NOT NULL DEFAULT 0,
    cost         NUMERIC(12, 6) NOT NULL DEFAULT 0,
    failures     JSONB       NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS generations_created_idx ON generations (created_at DESC);
-- Full-text-ish search over past scripts without a heavyweight index.
CREATE INDEX IF NOT EXISTS generations_text_idx
    ON generations USING gin (to_tsvector('simple', text));

-- A script is an ordered list of blocks, each with its own voice. That's how
-- two characters hold a conversation, and it lets one bad line be re-rendered
-- without paying to redo the other thirty-nine.
CREATE TABLE IF NOT EXISTS scripts (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT        NOT NULL DEFAULT 'Untitled',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blocks (
    id          BIGSERIAL PRIMARY KEY,
    script_id   BIGINT      NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
    position    INTEGER     NOT NULL,
    text        TEXT        NOT NULL DEFAULT '',
    voice       TEXT        NOT NULL DEFAULT '',
    model       TEXT        NOT NULL DEFAULT 'plus',
    language    TEXT,
    instruction TEXT,
    rate        REAL        NOT NULL DEFAULT 1,
    pitch       REAL        NOT NULL DEFAULT 1,
    volume      INTEGER     NOT NULL DEFAULT 50,
    seed        INTEGER     NOT NULL DEFAULT 0,
    -- Rendered audio is kept per block so assembling the whole script is free.
    audio_file  TEXT,
    duration_ms INTEGER,
    size_bytes  BIGINT      NOT NULL DEFAULT 0,
    cost        NUMERIC(12, 6) NOT NULL DEFAULT 0,
    rendered_at TIMESTAMPTZ,
    -- Set when the text or settings change after rendering, so the UI can show
    -- which blocks are out of date without re-reading the audio.
    stale       BOOLEAN     NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS blocks_script_idx ON blocks (script_id, position);

-- Brand names and acronyms the model mispronounces. Fixed once here, applied
-- to every render automatically instead of being hand-edited into each script.
CREATE TABLE IF NOT EXISTS pronunciations (
    id          BIGSERIAL PRIMARY KEY,
    pattern     TEXT        NOT NULL,
    replacement TEXT        NOT NULL,
    whole_word  BOOLEAN     NOT NULL DEFAULT true,
    match_case  BOOLEAN     NOT NULL DEFAULT false,
    enabled     BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A project is just a folder that can hold other folders. One project might be
-- a whole YouTube channel; another might be a single video that needs four
-- files. The same shape covers both, so nothing has to be decided up front.
CREATE TABLE IF NOT EXISTS projects (
    id         BIGSERIAL PRIMARY KEY,
    parent_id  BIGINT      REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_parent_idx ON projects (parent_id, name);

-- Every piece of audio belongs somewhere and has a place in the order.
-- position is what makes "Part 1, Part 2" work and what stitching follows.
ALTER TABLE generations ADD COLUMN IF NOT EXISTS project_id BIGINT
    REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS position INTEGER;
-- 'audio' or 'silence' — a silent part costs nothing but occupies a slot.
ALTER TABLE generations ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'audio';
ALTER TABLE generations ADD COLUMN IF NOT EXISTS title TEXT;
CREATE INDEX IF NOT EXISTS generations_project_idx
    ON generations (project_id, position);

-- Regenerating used to overwrite the audio. Now the old take is copied aside
-- and pointed at its part, so nothing you paid for is ever destroyed. The part
-- row always holds the take currently in use.
ALTER TABLE generations ADD COLUMN IF NOT EXISTS version_of BIGINT
    REFERENCES generations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS generations_version_idx ON generations (version_of);

-- Durations were being guessed from file size, which was wrong by exactly the
-- ratio of the real bitrate to the assumed one. Measured once, stored, trusted.
ALTER TABLE generations ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
-- Alibaba speech families are separate products. A tier name such as "plus"
-- is not enough to reconstruct a request without its engine.
ALTER TABLE generations ADD COLUMN IF NOT EXISTS engine TEXT NOT NULL DEFAULT 'audio';
-- A project can carry its own note, so you remember what it was for.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;

-- Transcripts are worth keeping: they cost money to produce and you often want
-- the SRT again later without re-running the recogniser.
CREATE TABLE IF NOT EXISTS transcripts (
    id          BIGSERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    name        TEXT        NOT NULL,
    source_url  TEXT,
    audio_url   TEXT,
    language    TEXT,
    duration_ms INTEGER     NOT NULL DEFAULT 0,
    text        TEXT        NOT NULL DEFAULT '',
    srt         TEXT        NOT NULL DEFAULT '',
    vtt         TEXT        NOT NULL DEFAULT '',
    sentences   JSONB       NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS transcripts_created_idx ON transcripts (created_at DESC);

-- What you decide about a voice: its picture, whether it's a favourite, any
-- note. This belongs beside the recordings that use it, not in a settings file
-- that a backup could miss.
-- Settings that belong to the work rather than to this machine: the prompts,
-- the file-name templates. They live here so a backup carries them and so the
-- app is not the only thing that can read them.
-- Every outbound call, paid or not, succeeded or not. The spend figure used to
-- add up `generations.cost`, which only ever knew about speech — transcription,
-- translation, rewriting, cloning and batches were spent and never written
-- down, so the total was always lower than the truth. This is the ledger.
CREATE TABLE IF NOT EXISTS jobs (
    id          BIGSERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind        TEXT NOT NULL,          -- speech, transcribe, translate, rewrite…
    model       TEXT,
    status      TEXT NOT NULL,          -- ok, failed, cancelled, blocked
    estimated   NUMERIC(12,6) DEFAULT 0,
    cost        NUMERIC(12,6) DEFAULT 0,
    chars       INTEGER DEFAULT 0,
    seconds     REAL DEFAULT 0,
    project_id  BIGINT REFERENCES projects(id) ON DELETE SET NULL,
    generation_id BIGINT REFERENCES generations(id) ON DELETE SET NULL,
    voice       TEXT,
    detail      TEXT,
    error       TEXT
);
CREATE INDEX IF NOT EXISTS jobs_when_idx ON jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_kind_idx ON jobs (kind);

-- A run is written when it starts and closed when it ends. That is what makes
-- "what is happening right now" survive a page reload, gives the elapsed time
-- for free, and lets the row point at what it finally produced.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS elapsed_ms INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parent_id BIGINT
    REFERENCES jobs(id) ON DELETE CASCADE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS usage JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cost_basis TEXT DEFAULT 'estimate';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS voice_identity_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS provider_voice_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS engine TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tier TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS usage JSONB;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS cost_basis TEXT DEFAULT 'estimate';
ALTER TABLE generations ADD COLUMN IF NOT EXISTS speech_mode TEXT DEFAULT 'exact';
ALTER TABLE generations ADD COLUMN IF NOT EXISTS provider_text TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS fidelity JSONB;
UPDATE generations
   SET fidelity = '{"status":"unverified","score":null,"coverage":null,"requested_words":0,"returned_words":0,"message":"This older Omni take predates returned-script verification."}'::jsonb
 WHERE engine = 'omni' AND fidelity IS NULL AND filename <> '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS done INTEGER DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS total INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS jobs_running_idx ON jobs (status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS jobs_parent_idx ON jobs (parent_id);

CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voices (
    id          TEXT PRIMARY KEY,
    image       TEXT,
    favourite   BOOLEAN NOT NULL DEFAULT false,
    note        TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A voice you cloned deserves the same description Alibaba gives its own, or it
-- can never be searched, filtered or cast alongside them.
ALTER TABLE voices ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS trait TEXT;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS scene TEXT;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS languages TEXT;
-- Provider identity is not presentation metadata. A cloned voice is bound to
-- one exact provider model, and losing that fact makes the UI offer requests
-- Alibaba will reject.
ALTER TABLE voices ADD COLUMN IF NOT EXISTS provider_voice_id TEXT;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS engine TEXT;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS target_model TEXT;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS provider_status TEXT;

-- A human-facing voice can have several provider/model-specific bindings.
-- Reference recordings belong to that identity, never to a transient model ID.
CREATE TABLE IF NOT EXISTS voice_identities (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE voice_identities ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE voice_identities ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE voice_identities ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE voice_identities ADD COLUMN IF NOT EXISTS accent TEXT;
ALTER TABLE voice_identities ADD COLUMN IF NOT EXISTS trait TEXT;
ALTER TABLE voice_identities ADD COLUMN IF NOT EXISTS scene TEXT;
ALTER TABLE voice_identities ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE voice_identities ADD COLUMN IF NOT EXISTS recording_language TEXT;
ALTER TABLE voice_identities ADD COLUMN IF NOT EXISTS favourite BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE voice_identities ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_voice_identity_id_fkey;
ALTER TABLE jobs ADD CONSTRAINT jobs_voice_identity_id_fkey
    FOREIGN KEY (voice_identity_id) REFERENCES voice_identities(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS voice_bindings (
    provider_voice_id TEXT NOT NULL,
    model_id          TEXT NOT NULL,
    identity_id       TEXT NOT NULL REFERENCES voice_identities(id) ON DELETE CASCADE,
    provider          TEXT NOT NULL DEFAULT 'alibaba',
    engine            TEXT NOT NULL,
    tier              TEXT NOT NULL,
    source            TEXT NOT NULL DEFAULT 'custom',
    status            TEXT NOT NULL DEFAULT 'active',
    languages         JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (provider_voice_id, model_id)
);
CREATE INDEX IF NOT EXISTS voice_bindings_identity_idx ON voice_bindings(identity_id);
CREATE TABLE IF NOT EXISTS voice_references (
    id              TEXT PRIMARY KEY,
    identity_id     TEXT REFERENCES voice_identities(id) ON DELETE SET NULL,
    original_name   TEXT,
    original_path   TEXT,
    normalized_path TEXT,
    source_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_references_identity_idx ON voice_references(identity_id);
CREATE TABLE IF NOT EXISTS voice_package_jobs (
    id                TEXT PRIMARY KEY,
    identity_id       TEXT NOT NULL REFERENCES voice_identities(id) ON DELETE CASCADE,
    reference_id      TEXT REFERENCES voice_references(id) ON DELETE SET NULL,
    model_id          TEXT NOT NULL,
    engine            TEXT NOT NULL,
    tier              TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'queued',
    provider_voice_id TEXT,
    error             TEXT,
    attempts          INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (identity_id, model_id)
);
CREATE INDEX IF NOT EXISTS voice_package_jobs_identity_idx
    ON voice_package_jobs(identity_id, created_at);

-- Every generated artifact keeps both our durable voice identity and the
-- exact provider binding used for reproducibility.
ALTER TABLE generations ADD COLUMN IF NOT EXISTS voice_identity_id TEXT
    REFERENCES voice_identities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS generations_voice_identity_idx
    ON generations(voice_identity_id, created_at DESC);

-- Preserve every provider-aware custom voice created before this schema.
INSERT INTO voice_identities (id, name, metadata)
SELECT 'custom:' || coalesce(nullif(provider_voice_id, ''), id),
       coalesce(nullif(name, ''), id),
       jsonb_build_object('migrated_from', 'voices')
  FROM voices
 WHERE coalesce(provider_voice_id, '') <> ''
    OR coalesce(engine, '') <> ''
ON CONFLICT (id) DO NOTHING;
INSERT INTO voice_bindings
    (provider_voice_id, model_id, identity_id, engine, tier, status, languages)
SELECT coalesce(nullif(provider_voice_id, ''), id), target_model,
       'custom:' || coalesce(nullif(provider_voice_id, ''), id), engine,
       CASE WHEN target_model LIKE '%flash%' THEN 'flash' ELSE 'plus' END,
       coalesce(nullif(provider_status, ''), 'active'),
       CASE WHEN coalesce(languages, '') = '' THEN '[]'::jsonb
            ELSE to_jsonb(regexp_split_to_array(languages, '[, ]+')) END
  FROM voices
 WHERE coalesce(engine, '') <> '' AND coalesce(target_model, '') <> ''
ON CONFLICT (provider_voice_id, model_id) DO NOTHING;

-- Promote presentation data from the per-provider legacy table. Provider IDs
-- remain bindings; editable human information lives once on the identity.
WITH legacy_ranked AS (
    SELECT b.identity_id, v.image, v.gender, v.age, v.trait, v.scene, v.note,
           v.languages,
           row_number() OVER (
               PARTITION BY b.identity_id
               ORDER BY v.updated_at DESC NULLS LAST, b.created_at DESC
           ) AS rank
      FROM voice_bindings b
      LEFT JOIN voices v
        ON v.id = regexp_replace(b.provider_voice_id,
           '^qwen[\w.-]*?-tts-(plus|flash)-', '', 'i')
          OR v.provider_voice_id = b.provider_voice_id
)
UPDATE voice_identities i
   SET image = coalesce(nullif(i.image, ''), legacy.image),
       gender = coalesce(nullif(i.gender, ''), nullif(i.metadata->>'gender', ''), legacy.gender),
       age = coalesce(i.age, nullif(i.metadata->>'age', '')::integer, legacy.age),
       accent = coalesce(nullif(i.accent, ''), nullif(i.metadata->>'accent', '')),
       trait = coalesce(nullif(i.trait, ''), nullif(i.metadata->>'trait', ''), legacy.trait),
       scene = coalesce(nullif(i.scene, ''), nullif(i.metadata->>'scene', ''), legacy.scene),
       notes = coalesce(nullif(i.notes, ''), nullif(i.metadata->>'notes', ''), legacy.note),
       recording_language = coalesce(
           nullif(i.recording_language, ''),
           nullif(i.metadata->>'language', ''),
           nullif(legacy.languages, '')
       )
  FROM legacy_ranked legacy
 WHERE legacy.identity_id = i.id AND legacy.rank = 1;

UPDATE generations g
   SET voice_identity_id = b.identity_id
  FROM voice_bindings b
 WHERE g.voice_identity_id IS NULL
   AND g.voice = b.provider_voice_id;

-- Tie a transcript to the recording it came from, so a part can show whether it
-- has subtitles and a stitch can gather them all in order.
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS generation_id BIGINT
    REFERENCES generations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS transcripts_generation_idx ON transcripts (generation_id);

-- A translation points at the transcript it came from, so the original stays
-- findable no matter how many languages are added later.
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS translated_from BIGINT
    REFERENCES transcripts(id) ON DELETE CASCADE;

-- Subtitles describe one recording. Re-record the part and they still point at
-- it while describing audio that no longer exists, so they get marked instead
-- of quietly lying.
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS stale BOOLEAN NOT NULL DEFAULT false;

-- A project can carry an emoji or an uploaded image, so a long list is
-- scannable by eye instead of by reading every name.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon TEXT;

-- Three fixed levels: a venture holds projects, a project holds folders, and a
-- folder holds recordings. Storing the level rather than counting parents means
-- a query can ask for "every venture" without walking the tree.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS level TEXT;
UPDATE projects SET level = 'venture' WHERE level IS NULL AND parent_id IS NULL;
UPDATE projects p SET level = 'project'
  FROM projects parent
 WHERE p.level IS NULL AND p.parent_id = parent.id AND parent.parent_id IS NULL;
UPDATE projects SET level = 'folder' WHERE level IS NULL;
ALTER TABLE projects ALTER COLUMN level SET DEFAULT 'folder';

-- A locked venture is part of the furniture: it can't be renamed, moved or
-- deleted, but everything inside it behaves normally. Unsorted and Sandbox are
-- the two that always exist.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false;

-- Public/domain identity is explicit. `level` stays during the compatibility
-- migration, but no rule is allowed to infer a library or inbox from its name.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS container_type TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS system_role TEXT;
UPDATE projects SET container_type = 'inbox', system_role = 'inbox'
 WHERE parent_id IS NULL AND name = 'Unsorted' AND container_type IS NULL;
UPDATE projects SET container_type = 'library', system_role = 'venture_assets'
 WHERE locked AND level = 'project' AND name = 'Assets' AND container_type IS NULL;
UPDATE projects child
   SET container_type = 'asset_collection',
       system_role = 'assets:' || lower(child.name)
  FROM projects library
 WHERE child.parent_id = library.id
   AND library.container_type = 'library'
   AND child.locked AND child.container_type IS NULL;
UPDATE projects SET container_type = CASE level
    WHEN 'venture' THEN 'venture'
    WHEN 'project' THEN 'project'
    ELSE 'production' END
 WHERE container_type IS NULL;
UPDATE projects SET system_role = 'sandbox'
 WHERE parent_id IS NULL AND name = 'Sandbox' AND system_role IS NULL;
ALTER TABLE projects ALTER COLUMN container_type SET NOT NULL;
CREATE INDEX IF NOT EXISTS projects_container_type_idx
    ON projects (container_type, parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS projects_system_role_parent_unique
    ON projects (parent_id, system_role) WHERE system_role IS NOT NULL;

-- A venture can sign its files differently from the rest. Blank fields mean
-- "inherit the global setting", so only the differences are stored.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS naming JSONB;

-- A part can point at a recording that lives in the venture's asset library
-- rather than owning its own audio. Update the outro once and every story that
-- uses it follows; a stitched file is a snapshot, so nothing already exported
-- ever changes underneath you.
ALTER TABLE generations ADD COLUMN IF NOT EXISTS asset_of BIGINT
    REFERENCES generations(id) ON DELETE SET NULL;

-- A script arrives written for the eye. It becomes something for the ear, then
-- optionally gets tags, and only then becomes audio. Every state is kept, so
-- none of it is a one-way door: `text` is what will be spoken, and these are
-- what it was before.
ALTER TABLE generations ADD COLUMN IF NOT EXISTS text_raw TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS text_shaped TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS text_tagged TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS text_state TEXT;

-- How a venture wants to sound, in your words. Every rewrite below it inherits
-- this, so a style is stated once instead of retyped per part.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS style_prompt TEXT;

-- One bed of music under a folder. It points at an asset in the venture's
-- library rather than a file of its own, so a track used by twelve episodes is
-- stored once and replaced once.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS music_of BIGINT
    REFERENCES generations(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS music_level TEXT DEFAULT 'discreet';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS music_fade_in REAL DEFAULT 2;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS music_fade_out REAL DEFAULT 4;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS music_duck BOOLEAN DEFAULT true;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS music_volume REAL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS music_start REAL DEFAULT 0;

-- Reusable media is a resource with immutable file versions. Legacy generation
-- links remain populated until every older client has migrated.
CREATE TABLE IF NOT EXISTS assets (
    id                   BIGSERIAL PRIMARY KEY,
    venture_id           BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    collection_id        BIGINT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    name                 TEXT NOT NULL,
    kind                 TEXT NOT NULL,
    legacy_generation_id BIGINT UNIQUE REFERENCES generations(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_venture_collection_idx
    ON assets (venture_id, collection_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS asset_versions (
    id                   BIGSERIAL PRIMARY KEY,
    asset_id             BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    version              INTEGER NOT NULL DEFAULT 1,
    source_generation_id BIGINT UNIQUE REFERENCES generations(id) ON DELETE SET NULL,
    filename             TEXT NOT NULL,
    path                 TEXT,
    size_bytes           BIGINT NOT NULL DEFAULT 0,
    duration_ms          INTEGER,
    mime_type            TEXT,
    checksum             TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (asset_id, version)
);
CREATE INDEX IF NOT EXISTS asset_versions_asset_idx
    ON asset_versions (asset_id, version DESC);

ALTER TABLE generations ADD COLUMN IF NOT EXISTS asset_id BIGINT
    REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS asset_version_id BIGINT
    REFERENCES asset_versions(id) ON DELETE SET NULL;

INSERT INTO assets (venture_id, collection_id, name, kind, legacy_generation_id)
SELECT library.parent_id, collection.id,
       coalesce(nullif(g.title, ''), nullif(g.text, ''), g.filename),
       replace(collection.system_role, 'assets:', ''), g.id
  FROM generations g
  JOIN projects collection ON collection.id = g.project_id
  JOIN projects library ON library.id = collection.parent_id
 WHERE collection.container_type = 'asset_collection'
   AND library.container_type = 'library'
   AND g.version_of IS NULL AND g.filename <> ''
ON CONFLICT (legacy_generation_id) DO UPDATE
 SET collection_id = EXCLUDED.collection_id,
     venture_id = EXCLUDED.venture_id,
     name = EXCLUDED.name,
     kind = EXCLUDED.kind,
     updated_at = now();

INSERT INTO asset_versions
    (asset_id, version, source_generation_id, filename, path, size_bytes,
     duration_ms, mime_type)
SELECT a.id, 1, g.id, g.filename, g.path, g.size_bytes, g.duration_ms,
       CASE lower(split_part(g.filename, '.', array_length(string_to_array(g.filename, '.'), 1)))
         WHEN 'mp3' THEN 'audio/mpeg' WHEN 'wav' THEN 'audio/wav'
         WHEN 'ogg' THEN 'audio/ogg' WHEN 'flac' THEN 'audio/flac'
         WHEN 'm4a' THEN 'audio/mp4' WHEN 'aac' THEN 'audio/aac'
         ELSE 'application/octet-stream' END
  FROM assets a JOIN generations g ON g.id = a.legacy_generation_id
ON CONFLICT (source_generation_id) DO UPDATE
 SET filename = EXCLUDED.filename, path = EXCLUDED.path,
     size_bytes = EXCLUDED.size_bytes, duration_ms = EXCLUDED.duration_ms,
     mime_type = EXCLUDED.mime_type;

UPDATE generations g SET asset_id = a.id, asset_version_id = v.id
  FROM assets a
  JOIN LATERAL (
       SELECT version.id FROM asset_versions version
        WHERE version.asset_id = a.id ORDER BY version.version DESC LIMIT 1
  ) v ON true
 WHERE (g.id = a.legacy_generation_id OR g.asset_of = a.legacy_generation_id)
   AND (g.asset_id IS DISTINCT FROM a.id OR g.asset_version_id IS DISTINCT FROM v.id);

-- Exports are immutable snapshots; the generation row remains as a legacy
-- playback/history projection while the manifest becomes the durable source.
CREATE TABLE IF NOT EXISTS exports (
    id             BIGSERIAL PRIMARY KEY,
    production_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    generation_id  BIGINT UNIQUE REFERENCES generations(id) ON DELETE SET NULL,
    filename       TEXT NOT NULL,
    manifest       JSONB NOT NULL DEFAULT '{}'::jsonb,
    renderer       TEXT NOT NULL DEFAULT 'legacy',
    duration_ms    INTEGER,
    size_bytes     BIGINT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exports_production_idx
    ON exports (production_id, created_at DESC);
INSERT INTO exports
    (production_id, generation_id, filename, manifest, renderer, duration_ms,
     size_bytes, created_at)
SELECT g.project_id, g.id, g.filename,
       jsonb_build_object('legacy', true, 'source', 'generation'),
       'legacy', g.duration_ms, g.size_bytes, g.created_at
  FROM generations g JOIN projects p ON p.id = g.project_id
 WHERE g.kind = 'stitch' AND g.filename <> ''
ON CONFLICT (generation_id) DO NOTHING;

-- Library uploads predate the explicit asset kind. Correct their identity so
-- they do not appear as a synthetic voice called "Uploaded".
UPDATE generations SET kind = 'asset'
 WHERE engine = 'upload' AND speech_mode = 'uploaded' AND kind <> 'asset';

-- Added later: a phoneme spelling is handled by the model itself (hot_fix)
-- rather than by our text substitution, so the written word stays intact.
-- Migration 004 owns the canonical BOOLEAN type; this remains additive for
-- databases initialized through the temporary legacy schema.
ALTER TABLE pronunciations ADD COLUMN IF NOT EXISTS phoneme BOOLEAN
    NOT NULL DEFAULT false;

-- Preserve the two system-owned roots previously created by db.ensure_fixtures.
INSERT INTO projects (name, level, locked, container_type, system_role)
SELECT 'Unsorted', 'venture', true, 'inbox', 'inbox'
 WHERE NOT EXISTS (SELECT 1 FROM projects WHERE system_role = 'inbox');

INSERT INTO projects (name, level, locked, container_type, system_role)
SELECT 'Sandbox', 'venture', true, 'venture', 'sandbox'
 WHERE NOT EXISTS (SELECT 1 FROM projects WHERE system_role = 'sandbox');

-- Every real Venture gets the four reusable Asset collections. These rows are
-- inserted before the canonical backfill below, exactly like the old startup.
INSERT INTO projects
    (name, parent_id, level, locked, container_type, system_role)
SELECT 'Assets', venture.id, 'project', true, 'library', 'venture_assets'
  FROM projects venture
 WHERE venture.container_type = 'venture'
   AND NOT EXISTS (
       SELECT 1 FROM projects library
        WHERE library.parent_id = venture.id
          AND library.system_role = 'venture_assets');

INSERT INTO projects
    (name, parent_id, level, locked, container_type, system_role)
SELECT item.name, library.id, 'folder', true, 'asset_collection', item.role
  FROM projects library
 CROSS JOIN (VALUES
     ('Intros', 'assets:intros'),
     ('Outros', 'assets:outros'),
     ('Music', 'assets:music'),
     ('Stingers', 'assets:stingers')
 ) AS item(name, role)
 WHERE library.system_role = 'venture_assets'
   AND NOT EXISTS (
       SELECT 1 FROM projects collection
        WHERE collection.parent_id = library.id
          AND collection.system_role = item.role);

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
