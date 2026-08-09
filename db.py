#!/usr/bin/env python3
"""
Generation history, stored in Postgres.

Every render is recorded with the text and the full settings that produced it,
so any past job can be reloaded into the editor and re-run — the audio file
alone can't tell you what voice or direction made it.

The database is optional. If it isn't reachable the app keeps working and falls
back to listing the audio folder; you just lose the text and the re-run button.
Start it with:  docker compose up -d
"""

import json
import os
from contextlib import contextmanager

DSN = os.getenv(
    "VOICE_STUDIO_DSN",
    "postgresql://voicestudio:voicestudio@127.0.0.1:5434/voicestudio",
)

SCHEMA = """
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
           '^qwen[\\w.-]*?-tts-(plus|flash)-', '', 'i')
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
"""

def _connect():
    """Open a connection, with a short timeout so a dead database fails fast."""
    import psycopg
    return psycopg.connect(DSN, connect_timeout=3)


@contextmanager
def cursor(write: bool = False):
    """Yield a cursor, or None when the database isn't reachable.

    Callers must handle None — losing history is an inconvenience, not a reason
    to fail a render the user already paid for.
    """
    # Only a failure to CONNECT means "no database". A query that blows up is a
    # real bug and must surface — catching it here and yielding a second time
    # turned every SQL error into "generator didn't stop after throw()".
    try:
        connection = _connect()
    except Exception:
        yield None
        return
    try:
        with connection.cursor() as cur:
            yield cur
        if write:
            connection.commit()
    finally:
        connection.close()


def init() -> bool:
    """Create the schema. Returns whether the database is usable."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute(SCHEMA)
    ensure_fixtures()
    ensure_all_assets()
    # Canonical domain tables are additive. Keeping this after fixture/library
    # creation lets a fresh database and an existing user database take the
    # exact same migration path.
    from domain.schema import migrate as migrate_domain
    with cursor(write=True) as cur:
        if cur is None:
            return False
        migrate_domain(cur)
        # Versions before 2026-08-08 classified Alibaba's "Model not exist"
        # ASR response as a deleted voice. Repair only that exact app-authored
        # message; provider audit fields and the failed status stay intact.
        cur.execute(
            """UPDATE jobs
                  SET error = 'Alibaba rejected the obsolete transcription model. '
                              'Audio Studio now uses qwen3-asr-flash-filetrans; retry the subtitles.'
                WHERE kind = 'transcribe' AND status = 'failed'
                  AND error = 'RuntimeError: That voice no longer exists on Alibaba''s side. '
                              'Press Reload list to refresh what you actually have.'""")
    compact_positions()
    return True


FIELDS = ("text", "text_raw", "text_shaped", "text_tagged", "text_state",
          "voice", "voice_identity_id", "engine", "model", "format", "language", "instruction", "rate",
          "pitch", "volume", "seed", "filename", "path", "size_bytes", "chars",
          "requests", "cost", "project_id", "position", "kind", "title",
          "duration_ms", "asset_of", "asset_id", "asset_version_id",
          "speech_mode", "usage", "cost_basis", "provider_text", "fidelity",
          "failures")


def record(row: dict, insert_at: int | None = None):
    """Save one generation. Returns its id, or None if the database is down."""
    # Every kind shares one table. Non-speech rows (silence, exports and linked
    # assets) do not naturally have synthesis settings, but the original table
    # contract requires those columns. Never send explicit NULLs and thereby
    # bypass PostgreSQL defaults.
    required_defaults = {
        "text": "", "voice": "-", "engine": "none", "model": "-",
        "format": "mp3", "rate": 1, "pitch": 1, "volume": 50, "seed": 0,
        "filename": "", "path": "", "size_bytes": 0, "chars": 0,
        "requests": 0, "cost": 0, "kind": "audio", "failures": [],
    }
    row = {**required_defaults, **row}
    for field, default in required_defaults.items():
        if row.get(field) is None:
            row[field] = default
    if insert_at is not None:
        row["position"] = int(insert_at)
    if not row.get("voice_identity_id") and row.get("voice") not in (None, "", "-"):
        row["voice_identity_id"] = voice_identity_for_provider(
            str(row["voice"]), str(row.get("engine") or ""), str(row.get("model") or ""))
    values = [json.dumps(row.get(f, {})) if f in ("usage", "fidelity") else row.get(f)
              for f in FIELDS[:-1]] + [json.dumps(row.get("failures", []))]
    # kind is NOT NULL with a default; None would violate it.
    values[FIELDS.index("kind")] = row.get("kind") or "audio"
    placeholders = ", ".join(["%s"] * len(FIELDS))
    with cursor(write=True) as cur:
        if cur is None:
            return None
        if insert_at is not None:
            cur.execute(
                "UPDATE generations SET position = position + 1 "
                "WHERE project_id = %s AND position >= %s",
                (row.get("project_id"), int(insert_at)),
            )
        cur.execute(
            f"INSERT INTO generations ({', '.join(FIELDS)}) "
            f"VALUES ({placeholders}) RETURNING id",
            values,
        )
        return cur.fetchone()[0]


def _row_to_dict(row, columns) -> dict:
    """Turn a database row into the shape the rest of the app expects."""
    data = dict(zip(columns, row))
    data["created_at"] = data["created_at"].isoformat()
    data["cost"] = float(data["cost"])
    return data


LIST_COLUMNS = ("id", "created_at", "text", "voice", "engine", "model", "filename",
                "size_bytes", "chars", "cost", "failures")


def history(limit: int = 60, search: str = "") -> list:
    """Past generations, newest first, for the list on the Speak tab."""
    with cursor() as cur:
        if cur is None:
            return []
        if search:
            cur.execute(
                f"SELECT {', '.join(LIST_COLUMNS)} FROM generations "
                f"WHERE version_of IS NULL AND text ILIKE %s "
                f"ORDER BY created_at DESC LIMIT %s",
                (f"%{search}%", limit),
            )
        else:
            cur.execute(
                f"SELECT {', '.join(LIST_COLUMNS)} FROM generations "
                f"WHERE version_of IS NULL ORDER BY created_at DESC LIMIT %s", (limit,),
            )
        return [_row_to_dict(r, LIST_COLUMNS) for r in cur.fetchall()]


ALL_COLUMNS = ("id", "created_at") + FIELDS


def get(generation_id: int):
    """Everything needed to reload a past job back into the editor."""
    with cursor() as cur:
        if cur is None:
            return None
        cur.execute(
            f"SELECT {', '.join(ALL_COLUMNS)} FROM generations WHERE id = %s",
            (generation_id,),
        )
        row = cur.fetchone()
        return _row_to_dict(row, ALL_COLUMNS) if row else None


def delete(generation_id: int) -> bool:
    """Remove a part and every take of it.

    Deleting only the part row left its takes in the table forever, pointing at
    an id that no longer existed — and the bulk delete already did it properly,
    so the two paths disagreed.
    """
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute("DELETE FROM generations WHERE id = %s OR version_of = %s",
                    (generation_id, generation_id))
        return True


# ─────────────────────────────── scripts ──────────────────────────────────

BLOCK_FIELDS = ("text", "voice", "model", "language", "instruction", "rate",
                "pitch", "volume", "seed")
BLOCK_COLUMNS = ("id", "position") + BLOCK_FIELDS + (
    "audio_file", "duration_ms", "size_bytes", "cost", "rendered_at", "stale")


def script_create(name: str = "Untitled"):
    """Left from the retired Script tab; kept until those tables are dropped."""
    with cursor(write=True) as cur:
        if cur is None:
            return None
        cur.execute("INSERT INTO scripts (name) VALUES (%s) RETURNING id", (name,))
        return cur.fetchone()[0]


def script_list() -> list:
    """Left from the retired Script tab."""
    with cursor() as cur:
        if cur is None:
            return []
        cur.execute(
            "SELECT s.id, s.name, s.updated_at, count(b.id), "
            "       count(b.id) FILTER (WHERE NOT b.stale AND b.audio_file IS NOT NULL) "
            "FROM scripts s LEFT JOIN blocks b ON b.script_id = s.id "
            "GROUP BY s.id ORDER BY s.updated_at DESC LIMIT 50"
        )
        return [{"id": i, "name": n, "updated_at": u.isoformat(),
                 "blocks": total, "ready": ready}
                for i, n, u, total, ready in cur.fetchall()]


def script_get(script_id: int):
    """Left from the retired Script tab."""
    with cursor() as cur:
        if cur is None:
            return None
        cur.execute("SELECT id, name FROM scripts WHERE id = %s", (script_id,))
        row = cur.fetchone()
        if not row:
            return None
        cur.execute(
            f"SELECT {', '.join(BLOCK_COLUMNS)} FROM blocks "
            f"WHERE script_id = %s ORDER BY position", (script_id,),
        )
        blocks = []
        for values in cur.fetchall():
            block = dict(zip(BLOCK_COLUMNS, values))
            block["cost"] = float(block["cost"])
            block["rendered_at"] = (block["rendered_at"].isoformat()
                                    if block["rendered_at"] else None)
            blocks.append(block)
        return {"id": row[0], "name": row[1], "blocks": blocks}


def script_rename(script_id: int, name: str) -> bool:
    """Left from the retired Script tab."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute("UPDATE scripts SET name = %s, updated_at = now() WHERE id = %s",
                    (name, script_id))
        return True


def script_delete(script_id: int) -> bool:
    """Left from the retired Script tab."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute("DELETE FROM scripts WHERE id = %s", (script_id,))
        return True


def blocks_save(script_id: int, blocks: list) -> list:
    """Replace a script's blocks, keeping rendered audio where nothing changed.

    Re-rendering is what costs money, so a block whose text and settings are
    untouched keeps its audio and its rendered flag even as it moves position.
    """
    with cursor(write=True) as cur:
        if cur is None:
            return []
        carried = ("audio_file", "duration_ms", "size_bytes", "cost", "rendered_at")
        cur.execute(
            f"SELECT id, {', '.join(BLOCK_FIELDS + carried)} "
            f"FROM blocks WHERE script_id = %s", (script_id,),
        )
        existing = {
            values[0]: dict(zip(BLOCK_FIELDS + carried, values[1:]))
            for values in cur.fetchall()
        }

        cur.execute("DELETE FROM blocks WHERE script_id = %s", (script_id,))
        saved = []
        for position, block in enumerate(blocks):
            previous = existing.get(block.get("id"))
            unchanged = previous is not None and all(
                str(previous[f]) == str(block.get(f, previous[f])) for f in BLOCK_FIELDS
            ) and previous["audio_file"]

            cur.execute(
                f"INSERT INTO blocks (script_id, position, {', '.join(BLOCK_FIELDS)}, "
                f"audio_file, duration_ms, size_bytes, cost, rendered_at, stale) "
                f"VALUES (%s, %s, {', '.join(['%s'] * len(BLOCK_FIELDS))}, "
                f"%s, %s, %s, %s, %s, %s) RETURNING id",
                [script_id, position] + [block.get(f) for f in BLOCK_FIELDS] + [
                    previous["audio_file"] if unchanged else None,
                    previous["duration_ms"] if unchanged else None,
                    previous["size_bytes"] if unchanged else 0,
                    previous["cost"] if unchanged else 0,
                    previous["rendered_at"] if unchanged else None,
                    not unchanged,
                ],
            )
            saved.append(cur.fetchone()[0])

        cur.execute("UPDATE scripts SET updated_at = now() WHERE id = %s", (script_id,))
        return saved


def block_rendered(block_id: int, audio_file: str, size_bytes: int, cost: float):
    """Left from the retired Script tab."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute(
            "UPDATE blocks SET audio_file = %s, size_bytes = %s, cost = %s, "
            "rendered_at = now(), stale = false WHERE id = %s",
            (audio_file, size_bytes, cost, block_id),
        )
        return True


def block_get(block_id: int):
    """Left from the retired Script tab."""
    with cursor() as cur:
        if cur is None:
            return None
        cur.execute(
            f"SELECT {', '.join(BLOCK_COLUMNS)}, script_id FROM blocks WHERE id = %s",
            (block_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        block = dict(zip(BLOCK_COLUMNS + ("script_id",), row))
        block["cost"] = float(block["cost"])
        block["rendered_at"] = (block["rendered_at"].isoformat()
                                if block["rendered_at"] else None)
        return block


# ──────────────────────────────── projects ────────────────────────────────

UNSORTED = "Unsorted"

# The three levels, and what each one is allowed to hold. Anything the user can
# do that would break this is refused with the reason, not silently corrected.
LEVELS = ("venture", "project", "folder")
CHILD_OF = {"venture": "project", "project": "folder", "folder": None}
LEVEL_WORD = {"venture": "venture", "project": "project", "folder": "folder"}


def level_of(project_id: int) -> str | None:
    """Whether this is a venture, a project or a folder."""
    with cursor() as cur:
        if cur is None:
            return None
        cur.execute("SELECT level FROM projects WHERE id = %s", (project_id,))
        row = cur.fetchone()
        return row[0] if row else None


def container_type_of(project_id: int) -> str | None:
    """Public/domain type, independent from the legacy three-level column."""
    with cursor() as cur:
        if cur is None:
            return None
        cur.execute("SELECT container_type FROM projects WHERE id = %s", (project_id,))
        row = cur.fetchone()
        return row[0] if row else None


def level_for_parent(parent_id) -> str:
    """What a new project becomes, given where it is being created."""
    if not parent_id:
        return "venture"
    parent_type = container_type_of(int(parent_id))
    return {"venture": "project", "project": "folder"}.get(parent_type, "folder")


def can_hold_recordings(project_id: int) -> bool:
    """Only a folder holds recordings — and Unsorted, which is where anything
    made without choosing a place ends up. Fixed library collections accept
    uploads through the asset API, never ordinary generated Parts."""
    with cursor() as cur:
        if cur is None:
            return False
        cur.execute("SELECT container_type FROM projects WHERE id = %s", (project_id,))
        row = cur.fetchone()
        return bool(row and row[0] in ("production", "inbox"))


SANDBOX = "Sandbox"
ASSETS = "Assets"
ASSET_FOLDERS = ("Intros", "Outros", "Music", "Stingers")


def ensure_assets(venture_id: int):
    """Every venture keeps its reusable audio in one locked place.

    Intros, outros, music beds — they belong to the brand, not to one story, so
    they live beside the content projects rather than inside one of them.
    """
    with cursor(write=True) as cur:
        if cur is None:
            return None
        cur.execute("SELECT id FROM projects WHERE parent_id = %s "
                    "AND system_role = 'venture_assets'", (venture_id,))
        row = cur.fetchone()
        if row:
            assets_id = row[0]
            cur.execute("UPDATE projects SET level = 'project', locked = true, "
                        "container_type = 'library', system_role = 'venture_assets' "
                        "WHERE id = %s", (assets_id,))
        else:
            cur.execute("INSERT INTO projects "
                        "(name, parent_id, level, locked, container_type, system_role) "
                        "VALUES (%s, %s, 'project', true, 'library', "
                        "'venture_assets') RETURNING id",
                        (ASSETS, venture_id))
            assets_id = cur.fetchone()[0]
        for name in ASSET_FOLDERS:
            role = f"assets:{name.lower()}"
            cur.execute("SELECT id FROM projects WHERE parent_id = %s "
                        "AND system_role = %s", (assets_id, role))
            folder = cur.fetchone()
            if folder:
                cur.execute("UPDATE projects SET level = 'folder', locked = true, "
                            "container_type = 'asset_collection', system_role = %s "
                            "WHERE id = %s", (role, folder[0]))
            else:
                cur.execute("INSERT INTO projects "
                            "(name, parent_id, level, locked, container_type, system_role) "
                            "VALUES (%s, %s, 'folder', true, 'asset_collection', %s)",
                            (name, assets_id, role))
        return assets_id


def ensure_all_assets():
    """Repair the fixed library contract for every real venture at startup.

    Unsorted is a technical inbox, not a brand, so it deliberately has no
    intros, outros, music or stingers of its own.
    """
    with cursor() as cur:
        if cur is None:
            return
        cur.execute("SELECT id FROM projects WHERE parent_id IS NULL "
                    "AND container_type = 'venture'")
        venture_ids = [row[0] for row in cur.fetchall()]
    for venture_id in venture_ids:
        ensure_assets(venture_id)


def is_assets(project_id: int) -> bool:
    """Whether this is a venture's locked asset library."""
    with cursor() as cur:
        if cur is None:
            return False
        cur.execute("SELECT container_type, system_role FROM projects WHERE id = %s",
                    (project_id,))
        row = cur.fetchone()
        return bool(row and row[0] == "library" and row[1] == "venture_assets")


def asset_library_context(asset_id: int) -> dict | None:
    """Return the durable library identity of one uploaded reusable asset."""
    with cursor() as cur:
        if cur is None:
            return None
        cur.execute("SELECT venture_id, kind, id, legacy_generation_id "
                    "FROM assets WHERE id = %s", (asset_id,))
        row = cur.fetchone()
        return ({"venture_id": row[0], "collection": row[1].title(),
                 "kind": row[1], "asset_id": row[2],
                 "legacy_generation_id": row[3]} if row else None)


def asset_get(asset_id: int) -> dict | None:
    """One Asset and its latest immutable version."""
    with cursor() as cur:
        if cur is None:
            return None
        cur.execute("""
            SELECT a.id, a.venture_id, a.collection_id, a.name, a.kind,
                   a.legacy_generation_id, v.id, v.filename, v.path,
                   v.size_bytes, v.duration_ms, v.mime_type
              FROM assets a
              JOIN LATERAL (
                   SELECT version.* FROM asset_versions version
                    WHERE version.asset_id = a.id
                    ORDER BY version.version DESC LIMIT 1
              ) v ON true
             WHERE a.id = %s
        """, (asset_id,))
        row = cur.fetchone()
        if not row:
            return None
        keys = ("id", "venture_id", "collection_id", "name", "kind",
                "legacy_generation_id", "version_id", "filename", "path",
                "size_bytes", "duration_ms", "mime_type")
        return dict(zip(keys, row))


def export_record(production_id: int, generation_id: int, filename: str,
                  manifest: dict, renderer: str, duration_ms: int | None,
                  size_bytes: int) -> int | None:
    """Persist one immutable export independently of its history projection."""
    with cursor(write=True) as cur:
        if cur is None:
            return None
        cur.execute("""
            INSERT INTO exports
                (production_id, generation_id, filename, manifest, renderer,
                 duration_ms, size_bytes)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (generation_id) DO UPDATE
              SET filename = EXCLUDED.filename, manifest = EXCLUDED.manifest,
                  renderer = EXCLUDED.renderer, duration_ms = EXCLUDED.duration_ms,
                  size_bytes = EXCLUDED.size_bytes
            RETURNING id
        """, (production_id, generation_id, filename, json.dumps(manifest),
              renderer, duration_ms, size_bytes))
        return cur.fetchone()[0]


def exports_for(production_id: int) -> list:
    """Immutable snapshots of one Production, newest first."""
    with cursor() as cur:
        if cur is None:
            return []
        cur.execute("SELECT id, production_id, generation_id, filename, manifest, "
                    "renderer, duration_ms, size_bytes, created_at FROM exports "
                    "WHERE production_id = %s ORDER BY created_at DESC, id DESC",
                    (production_id,))
        keys = ("id", "production_id", "generation_id", "filename", "manifest",
                "renderer", "duration_ms", "size_bytes", "created_at")
        rows = []
        for values in cur.fetchall():
            row = dict(zip(keys, values))
            row["created_at"] = row["created_at"].isoformat()
            rows.append(row)
        return rows


def export_get(export_id: int) -> dict | None:
    with cursor() as cur:
        if cur is None:
            return None
        cur.execute("SELECT id, production_id, generation_id, filename, manifest, "
                    "renderer, duration_ms, size_bytes, created_at FROM exports "
                    "WHERE id = %s", (export_id,))
        row = cur.fetchone()
        if not row:
            return None
        keys = ("id", "production_id", "generation_id", "filename", "manifest",
                "renderer", "duration_ms", "size_bytes", "created_at")
        result = dict(zip(keys, row))
        result["created_at"] = result["created_at"].isoformat()
        return result


def asset_allowed(project_id: int, asset_id: int, collections=None) -> bool:
    """An asset can only be used inside its own Venture and intended role."""
    destination = venture_of(project_id)
    source = asset_library_context(asset_id)
    if not destination or not source or destination["id"] != source["venture_id"]:
        return False
    return collections is None or source["collection"] in set(collections)


def asset_insert(project_id: int, asset_id: int, at=None):
    """Put a link to an asset into a folder's sequence."""
    asset = asset_get(asset_id)
    source = get(asset["legacy_generation_id"]) if asset else None
    if not source or not asset:
        return None
    position = make_room(project_id, int(at)) if at is not None else next_position(project_id)
    return record({
        "text": source["text"], "voice": source["voice"], "model": source["model"],
        "format": source["format"], "language": source["language"],
        "instruction": source["instruction"], "rate": source["rate"],
        "pitch": source["pitch"], "volume": source["volume"], "seed": source["seed"],
        # No filename of its own: it plays whatever the asset currently is.
        "filename": "", "path": "", "size_bytes": source["size_bytes"],
        "duration_ms": source["duration_ms"], "chars": 0, "requests": 0,
        "cost": 0, "project_id": project_id, "position": position,
        "kind": "asset", "title": source["title"] or "", "failures": [],
        "asset_of": asset["legacy_generation_id"], "asset_id": asset["id"],
        "asset_version_id": asset["version_id"],
    })


def ensure_fixtures():
    """The two ventures that are always there.

    Unsorted catches anything made without choosing a place. Sandbox is a
    permanent place to try things without touching real work.
    """
    with cursor(write=True) as cur:
        if cur is None:
            return
        for name in (UNSORTED, SANDBOX):
            cur.execute("SELECT id FROM projects WHERE parent_id IS NULL "
                        "AND name = %s", (name,))
            row = cur.fetchone()
            container_type = "inbox" if name == UNSORTED else "venture"
            system_role = "inbox" if name == UNSORTED else "sandbox"
            if row:
                cur.execute("UPDATE projects SET locked = true, level = 'venture', "
                            "container_type = %s, system_role = %s WHERE id = %s",
                            (container_type, system_role, row[0]))
            else:
                cur.execute("INSERT INTO projects "
                            "(name, level, locked, container_type, system_role) "
                            "VALUES (%s, 'venture', true, %s, %s)",
                            (name, container_type, system_role))


def is_locked(project_id: int) -> bool:
    """Whether this is part of the furniture — Unsorted, Sandbox, Assets."""
    with cursor() as cur:
        if cur is None:
            return False
        cur.execute("SELECT locked FROM projects WHERE id = %s", (project_id,))
        row = cur.fetchone()
        return bool(row and row[0])


def ensure_unsorted():
    """The home for anything made without choosing a project first."""
    with cursor(write=True) as cur:
        if cur is None:
            return None
        cur.execute("SELECT id FROM projects WHERE system_role = 'inbox'")
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute("INSERT INTO projects "
                    "(name, level, locked, container_type, system_role) "
                    "VALUES (%s, 'venture', true, 'inbox', 'inbox') RETURNING id",
                    (UNSORTED,))
        return cur.fetchone()[0]


def project_create(name: str, parent_id=None, level: str | None = None):
    """Make a venture, project or folder. The level is decided by the caller
    from where it is being created, never chosen by the person."""
    with cursor(write=True) as cur:
        if cur is None:
            return None
        container_type = {"venture": "venture", "project": "project",
                          "folder": "production"}.get(level or "folder", "production")
        cur.execute(
            "INSERT INTO projects (name, parent_id, level, container_type) "
            "VALUES (%s, %s, %s, %s) RETURNING id",
            (name.strip() or "Untitled", parent_id or None, level, container_type),
        )
        return cur.fetchone()[0]


def project_tree() -> list:
    """Every project, with counts for itself and for everything beneath it.

    A folder that only holds folders was reporting zero recordings, which read
    as empty when it wasn't — the totals have to roll up.
    """
    with cursor() as cur:
        if cur is None:
            return []
        cur.execute(
            """
            WITH RECURSIVE descendants AS (
                SELECT id AS root, id AS node FROM projects
                UNION ALL
                SELECT d.root, p.id FROM projects p
                JOIN descendants d ON p.parent_id = d.node
            ),
            rolled AS (
                -- Production metrics deliberately exclude static libraries.
                SELECT d.root,
                       count(g.id) FILTER (
                           WHERE g.version_of IS NULL
                             AND coalesce(g.kind, '') <> 'stitch'
                             AND node.container_type IN ('production', 'inbox')
                       ) AS total_parts,
                       coalesce(sum(g.cost) FILTER (
                           WHERE node.container_type IN ('production', 'inbox')
                       ), 0) AS total_cost,
                       count(g.id) FILTER (
                           WHERE g.version_of IS NULL AND g.filename <> ''
                             AND node.container_type = 'asset_collection'
                       ) AS total_files
                FROM descendants d
                JOIN projects node ON node.id = d.node
                LEFT JOIN generations g ON g.project_id = d.node
                GROUP BY d.root
            )
            SELECT p.id, p.parent_id, p.name, p.updated_at, p.icon, p.description,
                   p.level, p.locked, p.container_type, p.system_role,
                   count(g.id) FILTER (
                       WHERE g.version_of IS NULL
                         AND coalesce(g.kind, '') <> 'stitch'
                         AND p.container_type IN ('production', 'inbox')
                   ) AS own_parts,
                   coalesce(sum(g.cost) FILTER (
                       WHERE p.container_type IN ('production', 'inbox')
                   ), 0) AS own_cost,
                   count(g.id) FILTER (
                       WHERE g.version_of IS NULL AND g.filename <> ''
                         AND p.container_type = 'asset_collection'
                   ) AS own_files,
                   r.total_parts, r.total_cost, r.total_files
            FROM projects p
            LEFT JOIN generations g ON g.project_id = p.id
            JOIN rolled r ON r.root = p.id
            GROUP BY p.id, r.total_parts, r.total_cost, r.total_files
            ORDER BY p.name
            """
        )
        return [{"id": i, "parent_id": parent, "name": n,
                 "updated_at": u.isoformat(), "icon": icon or "",
                 "description": desc or "", "level": level or "folder",
                 "locked": bool(locked), "container_type": container_type,
                 "system_role": system_role,
                 "parts": own, "cost": float(own_cost),
                 "files": own_files, "all_files": total_files,
                 "all_parts": total, "all_cost": float(total_cost)}
                for i, parent, n, u, icon, desc, level, locked, container_type,
                    system_role, own, own_cost, own_files, total, total_cost,
                    total_files in cur.fetchall()]


def project_get(project_id: int):
    """One project with its breadcrumb, ready to render."""
    with cursor() as cur:
        if cur is None:
            return None
        cur.execute("SELECT id, parent_id, name, description, icon, level, locked, "
                    "container_type, system_role "
                    "FROM projects WHERE id = %s", (project_id,))
        row = cur.fetchone()
        if not row:
            return None
        # Walk up so the UI can show a breadcrumb without extra round trips.
        trail, current = [], row[1]
        while current:
            cur.execute("SELECT id, parent_id, name FROM projects WHERE id = %s",
                        (current,))
            parent = cur.fetchone()
            if not parent:
                break
            trail.insert(0, {"id": parent[0], "name": parent[2]})
            current = parent[1]
        return {"id": row[0], "parent_id": row[1], "name": row[2],
                "description": row[3] or "", "icon": row[4] or "",
                "level": row[5] or "folder", "locked": bool(row[6]),
                "container_type": row[7], "system_role": row[8],
                "trail": trail}


def set_duration(generation_id: int, duration_ms: int) -> bool:
    """Correct a recording's length — speech recognition knows it better
    than our own measurement does."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute("UPDATE generations SET duration_ms = %s WHERE id = %s",
                    (int(duration_ms), generation_id))
        return True


def transcript_for(generation_id: int):
    """The newest transcript of one recording, if it has one."""
    with cursor() as cur:
        if cur is None:
            return None
        # The original, never a translation of it.
        cur.execute(
            "SELECT id, duration_ms, sentences, stale FROM transcripts "
            "WHERE generation_id = %s AND translated_from IS NULL "
            "ORDER BY created_at DESC LIMIT 1",
            (generation_id,),
        )
        row = cur.fetchone()
        return ({"id": row[0], "duration_ms": row[1], "sentences": row[2],
                 "stale": row[3]} if row else None)


def transcribed_ids(project_id: int) -> dict:
    """Which recordings have subtitles, and whether those are out of date."""
    with cursor() as cur:
        if cur is None:
            return {}
        cur.execute(
            "SELECT t.generation_id, bool_or(t.stale) FROM transcripts t "
            "JOIN generations g ON g.id = t.generation_id "
            "WHERE g.project_id = %s AND t.translated_from IS NULL "
            "GROUP BY t.generation_id", (project_id,),
        )
        return {gen: stale for gen, stale in cur.fetchall()}


def project_naming(project_id: int, values: dict) -> bool:
    """A venture's own naming and tag overrides."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute("UPDATE projects SET naming = %s, updated_at = now() "
                    "WHERE id = %s", (json.dumps(values or {}), project_id))
        return True


def venture_of(project_id: int):
    """The venture a recording ultimately belongs to, with its overrides."""
    with cursor() as cur:
        if cur is None:
            return None
        cur.execute("""
            WITH RECURSIVE up AS (
                SELECT id, parent_id, name, level, container_type, naming, icon
                  FROM projects WHERE id = %s
                UNION ALL
                SELECT p.id, p.parent_id, p.name, p.level, p.container_type,
                       p.naming, p.icon
                  FROM projects p JOIN up ON up.parent_id = p.id
            )
            SELECT id, name, naming, icon FROM up
             WHERE container_type = 'venture' LIMIT 1
        """, (project_id,))
        row = cur.fetchone()
        return ({"id": row[0], "name": row[1], "naming": row[2] or {},
                 "icon": row[3] or ""} if row else None)


def place_of(generation_id: int):
    """Where a recording sits: its folder, its project, its venture, and which
    part of the sequence it is."""
    with cursor() as cur:
        if cur is None:
            return None
        cur.execute("SELECT project_id, version_of FROM generations WHERE id = %s",
                    (generation_id,))
        row = cur.fetchone()
        if not row:
            return None
        folder_id, parent_part = row
    folder = project_get(folder_id) if folder_id else None
    venture = venture_of(folder_id) if folder_id else None
    project = None
    if folder and folder["trail"]:
        project = (folder["trail"][-1]["name"]
                   if folder.get("container_type") == "production" else None)

    part_number, take_number = None, None
    if folder_id:
        sequence = [p for p in project_parts(folder_id) if p["kind"] != "stitch"]
        target = parent_part or generation_id
        for index, part in enumerate(sequence, 1):
            if part["id"] == target:
                part_number = index
                break
        if parent_part:
            older = takes(parent_part)
            for index, take in enumerate(older, 2):
                if take["id"] == generation_id:
                    take_number = index
                    break
    return {"folder": folder["name"] if folder else "",
            "project": project or "",
            "venture": venture["name"] if venture else "",
            "venture_naming": venture["naming"] if venture else {},
            "venture_icon": venture["icon"] if venture else "",
            "part": part_number, "take": take_number}


def project_icon(project_id: int, icon: str) -> bool:
    """The emoji or uploaded image a project wears."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute("UPDATE projects SET icon = %s, updated_at = now() WHERE id = %s",
                    (icon or None, project_id))
        return True


def project_describe(project_id: int, description: str) -> bool:
    """The line under a project's name."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute("UPDATE projects SET description = %s, updated_at = now() "
                    "WHERE id = %s", (description, project_id))
        return True


def backfill_durations(measure) -> int:
    """Measure anything recorded before durations were stored."""
    with cursor(write=True) as cur:
        if cur is None:
            return 0
        cur.execute("SELECT id, filename FROM generations "
                    "WHERE duration_ms IS NULL AND filename <> '' AND kind <> 'silence'")
        rows = cur.fetchall()
        done = 0
        for generation_id, filename in rows:
            ms = measure(filename)
            if ms:
                cur.execute("UPDATE generations SET duration_ms = %s WHERE id = %s",
                            (ms, generation_id))
                done += 1
        return done


def project_descendants(project_id: int) -> set:
    """Every project underneath this one, however deep."""
    with cursor() as cur:
        if cur is None:
            return set()
        cur.execute("""
            WITH RECURSIVE below AS (
                SELECT id FROM projects WHERE parent_id = %s
                UNION ALL
                SELECT p.id FROM projects p JOIN below b ON p.parent_id = b.id
            ) SELECT id FROM below""", (project_id,))
        return {r[0] for r in cur.fetchall()}


def project_move(project_id: int, parent_id):
    """Re-file a Venture, Project or Production without changing its role."""
    parent_id = int(parent_id) if parent_id else None
    item_type = container_type_of(project_id) or "production"
    if is_locked(project_id):
        return "This one is part of the furniture — it stays where it is."
    if parent_id == project_id:
        return "It can't live inside itself."
    if parent_id and parent_id in project_descendants(project_id):
        return "That's inside the one you're moving — it can't become its parent."

    if item_type == "venture" and parent_id:
        return "A venture is always at the top level — it can't go inside anything."
    if item_type != "venture" and not parent_id:
        return ("A Project can't sit at the top level. Only Ventures live there."
                if item_type == "project" else
                "A Production has to live inside a Project.")
    if parent_id:
        parent_type = container_type_of(parent_id) or "production"
        wanted = {"venture": "project", "project": "production"}.get(parent_type)
        if wanted != item_type:
            holds = {"venture": "Projects", "project": "Productions"}.get(
                parent_type, "recordings")
            return (f"A {parent_type.title()} holds {holds}, not "
                    f"{item_type.title()}s. Pick a "
                    f"{'Venture' if item_type == 'project' else 'Project'} instead.")
    with cursor(write=True) as cur:
        if cur is None:
            return "The database is unavailable."
        cur.execute("UPDATE projects SET parent_id = %s, updated_at = now() "
                    "WHERE id = %s", (parent_id, project_id))
    return None


def project_rename(project_id: int, name: str) -> bool:
    """Rename, unless it is locked."""
    if is_locked(project_id):
        return False
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute("UPDATE projects SET name = %s, updated_at = now() WHERE id = %s",
                    (name.strip() or "Untitled", project_id))
        return True


def project_delete(project_id: int, keep_audio: bool = True) -> bool:
    """Remove a project. Its audio is kept and moved to Unsorted."""
    if is_locked(project_id):
        return False
    """Remove a project. Its audio is orphaned to Unsorted unless told otherwise."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        if keep_audio:
            cur.execute("SELECT id FROM projects WHERE parent_id IS NULL "
                        "AND system_role = 'inbox'")
            home = cur.fetchone()
            if home:
                cur.execute(
                    "UPDATE generations SET project_id = %s, position = NULL "
                    "WHERE project_id IN ("
                    "  WITH RECURSIVE sub AS ("
                    "    SELECT id FROM projects WHERE id = %s"
                    "    UNION ALL SELECT p.id FROM projects p JOIN sub ON p.parent_id = sub.id)"
                    "  SELECT id FROM sub)",
                    (home[0], project_id),
                )
        cur.execute("DELETE FROM projects WHERE id = %s", (project_id,))
        return True


PART_COLUMNS = ("id", "created_at", "position", "kind", "title", "text",
                "text_raw", "text_shaped", "text_tagged", "text_state", "voice",
                "voice_identity_id", "engine", "model", "format", "language", "instruction", "rate", "pitch", "volume",
                "seed", "filename", "size_bytes", "chars", "cost", "duration_ms",
                "asset_of", "asset_id", "asset_version_id", "speech_mode", "cost_basis",
                "provider_text", "fidelity")


def project_parts(project_id: int) -> list:
    """Everything inside a folder, in order, with what each really cost and
    with linked assets resolved to the audio they point at."""
    with cursor() as cur:
        if cur is None:
            return []
        cur.execute(
            f"SELECT {', '.join('g.' + c for c in PART_COLUMNS)}, "
            f"       (SELECT coalesce(sum(t.cost), 0) FROM generations t "
            f"        WHERE t.version_of = g.id) AS takes_cost, "
            # A linked asset has no audio of its own — it plays the library
            # copy, so it follows every change made there.
            f"       coalesce(av.filename, a.filename) AS asset_filename, "
            f"       coalesce(av.duration_ms, a.duration_ms) AS asset_duration, "
            f"       a.text AS asset_text, a.voice AS asset_voice "
            f"FROM generations g "
            f"LEFT JOIN generations a ON a.id = g.asset_of "
            f"LEFT JOIN asset_versions av ON av.id = g.asset_version_id "
            f"WHERE g.project_id = %s AND g.version_of IS NULL "
            # Ungrouped rows sort last rather than vanishing.
            f"ORDER BY g.position NULLS LAST, g.created_at", (project_id,),
        )
        parts = []
        for values in cur.fetchall():
            part = dict(zip(PART_COLUMNS + ("takes_cost", "asset_filename",
                                            "asset_duration", "asset_text",
                                            "asset_voice"), values))
            part["spent"] = float(part["cost"]) + float(part.pop("takes_cost"))
            source_name = part.pop("asset_filename", None)
            source_length = part.pop("asset_duration", None)
            source_text = part.pop("asset_text", None)
            source_voice = part.pop("asset_voice", None)
            if part["kind"] == "asset":
                # A linked part owns no audio: it plays whatever the asset is
                # right now. If the asset was deleted it says so, rather than
                # silently contributing nothing to a stitch.
                part["missing"] = not source_name
                part["filename"] = source_name or ""
                part["duration_ms"] = source_length or part["duration_ms"]
                part["text"] = source_text or part["text"]
                part["voice"] = source_voice or part["voice"]
            part["created_at"] = part["created_at"].isoformat()
            part["cost"] = float(part["cost"])
            parts.append(part)
        return parts


def make_room(project_id: int, at: int) -> int:
    """Push existing parts down so something can be inserted at `at`."""
    with cursor(write=True) as cur:
        if cur is None:
            return 0
        cur.execute(
            "UPDATE generations SET position = position + 1 "
            "WHERE project_id = %s AND position >= %s",
            (project_id, at),
        )
        return at


def compact_positions(project_ids: list[int] | None = None) -> int:
    """Remove sequence gaps without changing the visible order."""
    with cursor(write=True) as cur:
        if cur is None:
            return 0
        where = "g.version_of IS NULL AND g.project_id IS NOT NULL AND g.position IS NOT NULL"
        params: list = []
        if project_ids:
            where += " AND g.project_id = ANY(%s)"
            params.append([int(project_id) for project_id in project_ids])
        cur.execute(f"""
            WITH ranked AS (
                SELECT g.id,
                       row_number() OVER (
                           PARTITION BY g.project_id
                           ORDER BY g.position, g.created_at, g.id
                       ) - 1 AS next_position
                  FROM generations g
                 WHERE {where}
            )
            UPDATE generations g
               SET position = ranked.next_position
              FROM ranked
             WHERE g.id = ranked.id AND g.position <> ranked.next_position
        """, params)
        return cur.rowcount


def is_bucket(project_id: int) -> bool:
    """Unsorted is a pile, not a sequence — no order, no gaps, no stitching."""
    with cursor() as cur:
        if cur is None:
            return False
        cur.execute("SELECT container_type FROM projects WHERE id = %s", (project_id,))
        row = cur.fetchone()
        return bool(row and row[0] == "inbox")


def next_position(project_id: int) -> int:
    """Where the next part goes in a folder's sequence."""
    with cursor() as cur:
        if cur is None:
            return 0
        cur.execute("SELECT coalesce(max(position), -1) + 1 FROM generations "
                    "WHERE project_id = %s", (project_id,))
        return cur.fetchone()[0]


def text_states(part_id: int, values: dict) -> bool:
    """Store where a part's words are in their journey."""
    allowed = {k: v for k, v in values.items()
               if k in ("text", "text_raw", "text_shaped", "text_tagged",
                        "text_state")}
    if not part_id or not allowed:
        return False
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute(
            f"UPDATE generations SET {', '.join(k + ' = %s' for k in allowed)} "
            f"WHERE id = %s", [*allowed.values(), part_id])
        return True


# What the words mean, in something a person would say out loud. Decibels are
# for engineers; this is for whoever is making a sleep guide at midnight.
MUSIC_LEVELS = {"discreet": 0.10, "present": 0.20, "loud": 0.34}


def music_get(project_id: int) -> dict:
    """The Asset used as a Production's background bed."""
    with cursor() as cur:
        if cur is None:
            return {}
        cur.execute("SELECT coalesce(a.id, p.music_of), p.music_level, "
                    "       p.music_fade_in, p.music_fade_out, p.music_duck, "
                    "       p.music_volume, p.music_start, "
                    "       coalesce(v.filename, g.filename), "
                    "       coalesce(a.name, g.text), "
                    "       coalesce(v.duration_ms, g.duration_ms) "
                    "  FROM projects p "
                    "  LEFT JOIN generations g ON g.id = p.music_of "
                    "  LEFT JOIN assets a ON a.legacy_generation_id = p.music_of "
                    "  LEFT JOIN LATERAL (SELECT version.* FROM asset_versions version "
                    "       WHERE version.asset_id = a.id ORDER BY version.version DESC "
                    "       LIMIT 1) v ON true "
                    " WHERE p.id = %s", (project_id,))
        row = cur.fetchone()
        if not row:
            return {}
        level = row[1] or "discreet"
        volume = float(row[5]) if row[5] is not None else MUSIC_LEVELS.get(level, .10)
        return {"music_of": row[0], "level": level,
                "fade_in": float(row[2] or 0), "fade_out": float(row[3] or 0),
                "duck": bool(row[4]), "volume": volume,
                "start": float(row[6] or 0), "filename": row[7] or "",
                "name": (row[8] or "")[:80], "duration_ms": row[9]}


def music_set(project_id: int, values: dict) -> bool:
    """Change the bed or how it sits."""
    if not can_hold_recordings(project_id):
        return False
    music_of = values.get("music_of")
    stored_music_of = music_of
    if music_of not in (None, "", 0, "0"):
        try:
            music_id = int(music_of)
        except (TypeError, ValueError):
            return False
        if not asset_allowed(project_id, music_id, {"Music"}):
            return False
        asset = asset_get(music_id)
        if not asset or not asset.get("legacy_generation_id"):
            return False
        stored_music_of = asset["legacy_generation_id"]
    allowed = {k: v for k, v in values.items()
               if k in ("music_of", "music_level", "music_fade_in",
                        "music_fade_out", "music_duck", "music_volume",
                        "music_start")}
    if "music_volume" in allowed:
        allowed["music_volume"] = max(0.0, min(1.0, float(allowed["music_volume"])))
    if "music_start" in allowed:
        allowed["music_start"] = max(0.0, float(allowed["music_start"]))
    if "music_of" in allowed:
        allowed["music_of"] = stored_music_of or None
    if not allowed:
        return False
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute(
            f"UPDATE projects SET {', '.join(k + ' = %s' for k in allowed)}, "
            f"updated_at = now() WHERE id = %s", [*allowed.values(), project_id])
        cur.execute("""
            INSERT INTO production_mixes
                (production_id, music_asset_id, level, volume, start_seconds,
                 fade_in_seconds, fade_out_seconds, duck, updated_at)
            SELECT production.id, asset.id, legacy.music_level,
                   coalesce(legacy.music_volume,
                     CASE legacy.music_level WHEN 'present' THEN .20
                       WHEN 'loud' THEN .34 ELSE .10 END),
                   coalesce(legacy.music_start, 0), legacy.music_fade_in,
                   legacy.music_fade_out, legacy.music_duck, now()
              FROM productions production
              JOIN projects legacy ON legacy.id = production.legacy_container_id
              LEFT JOIN assets asset ON asset.legacy_generation_id = legacy.music_of
             WHERE legacy.id = %s
            ON CONFLICT (production_id) DO UPDATE SET
              music_asset_id = EXCLUDED.music_asset_id, level = EXCLUDED.level,
              volume = EXCLUDED.volume, start_seconds = EXCLUDED.start_seconds,
              fade_in_seconds = EXCLUDED.fade_in_seconds,
              fade_out_seconds = EXCLUDED.fade_out_seconds,
              duck = EXCLUDED.duck, updated_at = now()
        """, (project_id,))
        return True


def migrate_scripts() -> dict:
    """Move the Script tab's work into Projects, then leave the tables alone.

    A script was always a folder with ordered parts — the same idea built twice.
    Each becomes a folder in Sandbox, each block a part: one that was rendered
    keeps its audio, one that never was arrives as a draft. Nothing is deleted;
    the old tables stay untouched in case this needs looking at again.
    """
    with cursor() as cur:
        if cur is None:
            return {"moved": 0}
        cur.execute("SELECT id, name FROM scripts ORDER BY id")
        scripts = cur.fetchall()
    if not scripts:
        return {"moved": 0, "folders": []}

    sandbox = None
    for project in project_tree():
        if project.get("system_role") == "sandbox":
            sandbox = project["id"]
    if not sandbox:
        return {"moved": 0, "folders": []}

    home = None
    for project in project_tree():
        if project["parent_id"] == sandbox and project["name"] == "Imported scripts":
            home = project["id"]
    if not home:
        home = project_create("Imported scripts", sandbox, "project")

    made = []
    for script_id, name in scripts:
        already = [p for p in project_tree()
                   if p["parent_id"] == home and p["name"] == (name or "").strip()]
        if already:
            continue
        folder = project_create((name or "Untitled").strip(), home, "folder")
        with cursor() as cur:
            cur.execute(
                "SELECT position, text, voice, model, language, instruction, "
                "       rate, pitch, volume, seed, audio_file, duration_ms, "
                "       size_bytes, cost FROM blocks WHERE script_id = %s "
                "ORDER BY position", (script_id,))
            blocks = cur.fetchall()
        for index, b in enumerate(blocks):
            (pos, text, voice, model, language, instruction, rate, pitch,
             volume, seed, audio, ms, size, cost) = b
            record({
                "text": text or "", "voice": voice or "-", "model": model or "plus",
                "format": "mp3", "language": language, "instruction": instruction,
                "rate": rate or 1, "pitch": pitch or 1, "volume": volume or 50,
                "seed": seed or 0, "filename": audio or "", "path": "",
                "size_bytes": size or 0, "duration_ms": ms or 0,
                "chars": len(text or ""), "requests": 0, "cost": cost or 0,
                "project_id": folder, "position": index,
                # No audio means it was never rendered — which is exactly a draft.
                "kind": "audio" if audio else "draft",
                "title": None, "failures": [],
            })
        made.append({"name": name, "folder": folder, "parts": len(blocks)})
    return {"moved": len(made), "folders": made}


def project_style(project_id: int, prompt: str) -> bool:
    """How a venture wants to sound, in the owner's words."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute("UPDATE projects SET style_prompt = %s, updated_at = now() "
                    "WHERE id = %s", (prompt or None, project_id))
        return True


def style_for(project_id: int) -> str:
    """The style of the venture this folder belongs to."""
    venture = venture_of(project_id)
    if not venture:
        return ""
    with cursor() as cur:
        if cur is None:
            return ""
        cur.execute("SELECT style_prompt FROM projects WHERE id = %s",
                    (venture["id"],))
        row = cur.fetchone()
        return (row[0] or "") if row else ""


def draft_save(part_id: int, values: dict) -> bool:
    """Update a draft's words and settings. No audio is involved."""
    allowed = ("text", "text_raw", "text_shaped", "text_tagged", "text_state", "voice",
               "engine", "model", "format", "language", "instruction",
               "speech_mode", "rate", "pitch", "volume", "seed", "chars")
    if "voice" in values:
        values = {**values, "voice_identity_id": voice_identity_for_provider(
            str(values.get("voice") or ""), str(values.get("engine") or ""),
            str(values.get("model") or ""))}
        allowed = (*allowed, "voice_identity_id")
    fields = [f for f in allowed if f in values]
    if not fields:
        return False
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute(
            f"UPDATE generations SET {', '.join(f + ' = %s' for f in fields)} "
            f"WHERE id = %s AND kind = 'draft'",
            [values[f] for f in fields] + [part_id],
        )
        return True


def part_duplicate(part_id: int, filename: str = ""):
    """Copy a part in place, landing directly after the original.

    Everything below shifts down first, so the copy has a position of its own
    rather than fighting the original for one.
    """
    with cursor(write=True) as cur:
        if cur is None:
            return None
        cur.execute("SELECT project_id, position FROM generations WHERE id = %s",
                    (part_id,))
        row = cur.fetchone()
        if not row:
            return None
        project_id, position = row
        position = position if position is not None else 0
        cur.execute("UPDATE generations SET position = position + 1 "
                    "WHERE project_id = %s AND position > %s", (project_id, position))
        # asset_of has to come along: a copy of a linked part is another link,
        # not an orphan with no audio behind it.
        columns = ("text", "text_raw", "text_shaped", "text_tagged", "text_state",
                   "voice", "voice_identity_id", "engine", "model", "format", "language", "instruction",
                   "rate", "pitch", "volume", "seed", "path", "size_bytes",
                   "chars", "requests", "failures", "project_id", "kind",
                   "title", "duration_ms", "asset_of", "speech_mode", "usage", "cost_basis")
        cur.execute(
            f"INSERT INTO generations ({', '.join(columns)}, filename, position, cost) "
            f"SELECT {', '.join(columns)}, %s, %s, 0 FROM generations WHERE id = %s "
            f"RETURNING id",
            (filename or "", position + 1, part_id),
        )
        return cur.fetchone()[0]


def _recover_part_spend(cur, ids: list[int]) -> None:
    """Materialise pre-ledger speech cost before its last content row leaves.

    New provider work already has a Job and therefore needs no recovery. This
    only fills the positive difference for old current/archived takes. Keeping
    it separate from file deletion makes the accounting rule directly
    regression-testable inside a rolled-back database transaction.
    """
    for part_id in ids:
        cur.execute("""
            SELECT root.project_id, root.voice, root.voice_identity_id,
                   root.engine, root.model, min(all_takes.created_at),
                   coalesce(sum(all_takes.cost), 0),
                   coalesce((SELECT sum(j.cost) FROM jobs j
                              WHERE j.kind = 'speech'
                                AND (j.generation_id = root.id OR j.generation_id IN (
                                  SELECT id FROM generations WHERE version_of = root.id))), 0)
              FROM generations root
              JOIN generations all_takes
                ON all_takes.id = root.id OR all_takes.version_of = root.id
             WHERE root.id = %s
             GROUP BY root.id
        """, (part_id,))
        recovery = cur.fetchone()
        if not recovery:
            continue
        (project_id, voice, identity_id, engine, model, created_at,
         content_cost, tracked_cost) = recovery
        gap = round(max(0.0, float(content_cost) - float(tracked_cost)), 6)
        if gap <= 0:
            continue
        tier = "flash" if "flash" in str(model or "") else "plus"
        cur.execute("""
            INSERT INTO jobs
              (created_at, kind, model, status, estimated, cost,
               project_id, generation_id, voice, voice_identity_id,
               provider_voice_id, engine, tier, detail, cost_basis)
            VALUES (%s, 'speech', %s, 'ok', %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    'Recovered pre-ledger Part spend before deletion',
                    'historical_generation')
        """, (created_at, model, gap, gap, project_id, part_id, voice,
              identity_id, voice, engine, tier))


def parts_delete(ids: list) -> list:
    """Remove Parts or owned library Assets and report removable files.

    An Asset row in its own collection owns its immutable versions. A linked
    Asset inside a Production does not; deleting that Part must never delete
    the Venture's source file.
    """
    ids = [int(i) for i in ids]
    if not ids:
        return []
    with cursor(write=True) as cur:
        if cur is None:
            return []
        cur.execute("SELECT DISTINCT project_id FROM generations "
                    "WHERE id = ANY(%s) AND project_id IS NOT NULL", (ids,))
        affected_projects = [row[0] for row in cur.fetchall()]
        # The recovered line uses the original generation date, so deleting
        # old work never inflates today's spend.
        _recover_part_spend(cur, ids)
        cur.execute("""
            SELECT DISTINCT a.id
              FROM generations g
              JOIN assets a ON a.id = g.asset_id
             WHERE g.id = ANY(%s) AND a.collection_id = g.project_id
        """, (ids,))
        owned_assets = [row[0] for row in cur.fetchall()]
        if owned_assets:
            cur.execute("SELECT filename FROM asset_versions "
                        "WHERE asset_id = ANY(%s)", (owned_assets,))
            asset_files = [row[0] for row in cur.fetchall() if row[0]]
            cur.execute("DELETE FROM assets WHERE id = ANY(%s)", (owned_assets,))
        else:
            asset_files = []
        cur.execute("SELECT filename FROM generations WHERE id = ANY(%s) "
                    "OR version_of = ANY(%s)", (ids, ids))
        files = asset_files + [r[0] for r in cur.fetchall() if r[0]]
        cur.execute("DELETE FROM generations WHERE id = ANY(%s) OR version_of = ANY(%s)",
                    (ids, ids))
        if affected_projects:
            cur.execute("""
                WITH ranked AS (
                    SELECT id,
                           row_number() OVER (
                               PARTITION BY project_id
                               ORDER BY position, created_at, id
                           ) - 1 AS next_position
                      FROM generations
                     WHERE version_of IS NULL
                       AND project_id = ANY(%s)
                       AND position IS NOT NULL
                )
                UPDATE generations g
                   SET position = ranked.next_position
                  FROM ranked
                 WHERE g.id = ranked.id AND g.position <> ranked.next_position
            """, (affected_projects,))
        return list(dict.fromkeys(files))


def parts_move(ids: list, project_id: int) -> bool:
    """Re-file several parts, appending them after whatever is already there."""
    ids = [int(i) for i in ids]
    if not ids:
        return False
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute("SELECT coalesce(max(position), -1) FROM generations "
                    "WHERE project_id = %s", (project_id,))
        start = cur.fetchone()[0] + 1
        for offset, part_id in enumerate(ids):
            cur.execute("UPDATE generations SET project_id = %s, position = %s "
                        "WHERE id = %s", (project_id, start + offset, part_id))
            cur.execute("UPDATE generations SET project_id = %s "
                        "WHERE version_of = %s", (project_id, part_id))
        return True


def transcripts_for(generation_id: int) -> list:
    """Every transcript of one recording — the original and its translations."""
    with cursor() as cur:
        if cur is None:
            return []
        cur.execute(
            "SELECT id, name, language, duration_ms, translated_from, stale "
            "FROM transcripts WHERE generation_id = %s ORDER BY created_at",
            (generation_id,))
        return [{"id": i, "name": n, "language": lang, "duration_ms": ms,
                 "is_translation": parent is not None, "stale": stale}
                for i, n, lang, ms, parent, stale in cur.fetchall()]


def translated_ids(project_id: int) -> dict:
    """Which recordings in a project have translations, and into what."""
    with cursor() as cur:
        if cur is None:
            return {}
        cur.execute("""
            SELECT t.generation_id, t.language FROM transcripts t
            JOIN generations g ON g.id = t.generation_id
            WHERE g.project_id = %s AND t.translated_from IS NOT NULL""",
            (project_id,))
        found = {}
        for gen_id, language in cur.fetchall():
            found.setdefault(gen_id, []).append(language)
        return found


def parts_reorder(project_id: int, ordered_ids: list) -> bool:
    """Write a new order for a folder's parts."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        for index, generation_id in enumerate(ordered_ids):
            cur.execute("UPDATE generations SET position = %s "
                        "WHERE id = %s AND project_id = %s",
                        (index, generation_id, project_id))
        cur.execute("UPDATE projects SET updated_at = now() WHERE id = %s",
                    (project_id,))
        return True


def generation_move(generation_id: int, project_id: int) -> bool:
    """Move a part to another project, taking its takes with it."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute("UPDATE generations SET project_id = %s, position = "
                    "(SELECT coalesce(max(position), -1) + 1 FROM generations "
                    " WHERE project_id = %s) WHERE id = %s",
                    (project_id, project_id, generation_id))
        # An archived take keeps no position of its own; it just has to live in
        # the same project as the part it belongs to.
        cur.execute("UPDATE generations SET project_id = %s WHERE version_of = %s",
                    (project_id, generation_id))
        return True


def adopt_orphans(project_id: int) -> int:
    """Give every unfiled generation a home — used once, on upgrade."""
    with cursor(write=True) as cur:
        if cur is None:
            return 0
        cur.execute(
            "UPDATE generations SET project_id = %s WHERE project_id IS NULL",
            (project_id,),
        )
        return cur.rowcount


# ──────────────────────────────── versions ────────────────────────────────

COPIED = ("text", "text_raw", "text_shaped", "text_tagged", "text_state",
          "voice", "voice_identity_id", "engine", "model", "format", "language", "instruction", "rate",
          "pitch", "volume", "seed", "filename", "path", "size_bytes", "chars",
          "requests", "cost", "kind", "title", "duration_ms", "speech_mode",
          "usage", "cost_basis", "provider_text", "fidelity",
          "asset_of", "asset_id", "asset_version_id")


def archive_take(part_id: int):
    """Copy a part's current take aside before it's replaced."""
    with cursor(write=True) as cur:
        if cur is None:
            return None
        columns = ", ".join(COPIED)
        cur.execute(
            f"INSERT INTO generations ({columns}, project_id, version_of, failures) "
            f"SELECT {columns}, project_id, %s, failures FROM generations "
            f"WHERE id = %s RETURNING id",
            (part_id, part_id),
        )
        return cur.fetchone()[0]


def replace_take(part_id: int, values: dict) -> bool:
    """Put a freshly made take into the part row itself."""
    if "voice" in values and "voice_identity_id" not in values:
        values = {**values, "voice_identity_id": voice_identity_for_provider(
            str(values.get("voice") or ""), str(values.get("engine") or ""),
            str(values.get("model") or ""))}
    fields = [f for f in COPIED if f in values]
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute(
            f"UPDATE generations SET {', '.join(f + ' = %s' for f in fields)}, "
            f"created_at = now() WHERE id = %s",
            [json.dumps(values[f] or {}) if f in ("usage", "fidelity") else values[f]
             for f in fields] + [part_id],
        )
        return True


def mark_transcripts_stale(generation_id: int) -> int:
    """The audio of this part changed, so anything written from it is out of date."""
    with cursor(write=True) as cur:
        if cur is None:
            return 0
        cur.execute("UPDATE transcripts SET stale = true WHERE generation_id = %s "
                    "AND stale = false", (generation_id,))
        return cur.rowcount


def clear_stale(generation_id: int, keep_id: int) -> int:
    """A fresh transcript replaces the out-of-date ones for this recording.

    The old ones are removed rather than left beside the new one: two subtitle
    files for the same audio, one of them wrong, is worse than none.
    """
    with cursor(write=True) as cur:
        if cur is None:
            return 0
        cur.execute("DELETE FROM transcripts WHERE generation_id = %s "
                    "AND stale = true AND id <> %s", (generation_id, keep_id))
        removed = cur.rowcount
        cur.execute("UPDATE transcripts SET stale = false WHERE id = %s", (keep_id,))
        return removed


def takes(part_id: int) -> list:
    """Older takes of a part, newest first. The part row itself is the current one."""
    with cursor() as cur:
        if cur is None:
            return []
        cur.execute(
            "SELECT id, created_at, voice, voice_identity_id, model, rate, pitch, seed, filename, "
            "       size_bytes, cost, text, duration_ms, instruction, language, fidelity "
            "FROM generations "
            "WHERE version_of = %s ORDER BY created_at DESC", (part_id,),
        )
        return [{"id": i, "when": c.isoformat(), "voice": v,
                 "voice_identity_id": identity_id,
                 "model": m, "rate": float(r), "pitch": float(p), "seed": s,
                 "filename": f, "size_bytes": sz, "cost": float(co), "text": t,
                 "duration_ms": ms, "instruction": ins, "language": lang,
                 "fidelity": fidelity}
                for i, c, v, identity_id, m, r, p, s, f, sz, co, t, ms, ins, lang, fidelity
                in cur.fetchall()]


def promote_take(take_id: int) -> bool:
    """Swap an older take back into the part, keeping the displaced one."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute("SELECT version_of FROM generations WHERE id = %s", (take_id,))
        row = cur.fetchone()
        if not row or not row[0]:
            return False
        part_id = row[0]
        columns = ", ".join(COPIED)
        # The current take moves into the take being promoted, and vice versa —
        # a straight swap, so neither is lost.
        cur.execute(f"SELECT {columns} FROM generations WHERE id = %s", (part_id,))
        current = cur.fetchone()
        cur.execute(f"SELECT {columns} FROM generations WHERE id = %s", (take_id,))
        chosen = cur.fetchone()
        assignments = ", ".join(f + " = %s" for f in COPIED)
        cur.execute(f"UPDATE generations SET {assignments} WHERE id = %s",
                    list(chosen) + [part_id])
        cur.execute(f"UPDATE generations SET {assignments} WHERE id = %s",
                    list(current) + [take_id])
        return True


def take_part_id(take_id: int) -> int | None:
    """Return the stable Part id that owns either a current or archived take."""
    with cursor() as cur:
        if cur is None:
            return None
        cur.execute("SELECT coalesce(version_of, id) FROM generations WHERE id = %s",
                    (take_id,))
        row = cur.fetchone()
        return int(row[0]) if row else None


def take_count(part_id: int) -> int:
    """How many older takes a part has kept."""
    with cursor() as cur:
        if cur is None:
            return 0
        cur.execute("SELECT count(*) FROM generations WHERE version_of = %s", (part_id,))
        return cur.fetchone()[0]


# ─────────────────────────────── transcripts ──────────────────────────────

TRANSCRIPT_FIELDS = ("name", "source_url", "audio_url", "language",
                     "duration_ms", "text", "srt", "vtt", "generation_id",
                     "translated_from", "source_job_id", "model",
                     "provider_region", "price_version", "catalog_rate",
                     "catalog_cost", "cost_basis", "sentences")


def transcript_save(row: dict):
    """Keep subtitles, so the same audio is never paid for twice."""
    values = [row.get(f) for f in TRANSCRIPT_FIELDS[:-1]]
    values.append(json.dumps(row.get("sentences", [])))
    with cursor(write=True) as cur:
        if cur is None:
            return None
        cur.execute(
            f"INSERT INTO transcripts ({', '.join(TRANSCRIPT_FIELDS)}) "
            f"VALUES ({', '.join(['%s'] * len(TRANSCRIPT_FIELDS))}) RETURNING id",
            values,
        )
        return cur.fetchone()[0]


def transcript_list(limit: int = 40) -> list:
    """Recent transcripts for the Subtitles tab."""
    with cursor() as cur:
        if cur is None:
            return []
        cur.execute(
            "SELECT transcript.id, transcript.public_id, transcript.created_at, transcript.name, transcript.duration_ms, "
            "       jsonb_array_length(transcript.sentences), transcript.model, transcript.provider_region, "
            "       transcript.catalog_cost, transcript.cost_basis, job.public_id "
            "  FROM transcripts transcript LEFT JOIN jobs job ON job.id = transcript.source_job_id "
            "ORDER BY created_at DESC LIMIT %s", (limit,),
        )
        return [{"id": row[0], "public_id": str(row[1]),
                 "when": row[2].strftime("%b %d, %H:%M"), "name": row[3],
                 "duration_ms": row[4], "lines": row[5], "model": row[6],
                 "provider_region": row[7], "cost": float(row[8] or 0),
                 "cost_basis": row[9], "source_job_id": str(row[10]) if row[10] else None}
                for row in cur.fetchall()]


def transcript_get(transcript_id: int):
    """One transcript in full, with its cues."""
    with cursor() as cur:
        if cur is None:
            return None
        cur.execute(
            f"SELECT transcript.id, transcript.public_id, transcript.created_at, "
            f"{', '.join('transcript.' + field for field in TRANSCRIPT_FIELDS)}, job.public_id "
            f"FROM transcripts transcript LEFT JOIN jobs job ON job.id = transcript.source_job_id "
            f"WHERE transcript.id = %s", (transcript_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        data = dict(zip(("id", "public_id", "created_at") + TRANSCRIPT_FIELDS + ("source_job_public_id",), row))
        data["public_id"] = str(data["public_id"])
        data["source_job_public_id"] = str(data["source_job_public_id"]) if data["source_job_public_id"] else None
        data["created_at"] = data["created_at"].isoformat()
        return data


def transcript_delete(transcript_id: int) -> bool:
    """Remove a transcript."""
    with cursor(write=True) as cur:
        if cur is None:
            return False
        cur.execute("DELETE FROM transcripts WHERE id = %s", (transcript_id,))
        return True


if __name__ == "__main__":
    print("DSN:", DSN)
    print("schema created" if init() else "database unreachable")
