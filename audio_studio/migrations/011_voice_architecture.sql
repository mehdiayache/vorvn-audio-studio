-- Canonical voice-production domain.  This migration is deliberately
-- additive: runtime callers move to these records before legacy generation
-- columns are retired in a later verified migration.

-- Capabilities are data, never a closed application enum.
CREATE TABLE IF NOT EXISTS capabilities (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    controls    JSONB NOT NULL DEFAULT '{}'::jsonb,
    ui_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO capabilities (id, name, description, controls)
VALUES
    ('expressive_tags', 'Expressive + tags',
     'Expressive speech with documented delivery tags.',
     '{"delivery_tags":true,"natural_direction":true,"rate":true,"pitch":true,"volume":true}'::jsonb),
    ('exact_longform', 'Exact long reading',
     'Faithful long-form speech from a cloned voice.',
     '{"delivery_tags":false,"natural_direction":false}'::jsonb),
    ('natural_performance', 'Natural performance',
     'Natural-language directed multilingual performance.',
     '{"delivery_tags":false,"natural_direction":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS provider_models (
    id                    TEXT PRIMARY KEY,
    provider              TEXT NOT NULL,
    region                TEXT NOT NULL,
    model_id              TEXT NOT NULL,
    tier                  TEXT NOT NULL,
    operation             TEXT NOT NULL DEFAULT 'speech',
    enrollment_languages  JSONB NOT NULL DEFAULT '[]'::jsonb,
    output_languages      JSONB NOT NULL DEFAULT '[]'::jsonb,
    limits                JSONB NOT NULL DEFAULT '{}'::jsonb,
    segmentation          JSONB NOT NULL DEFAULT '{}'::jsonb,
    pricing               JSONB NOT NULL DEFAULT '{}'::jsonb,
    status                TEXT NOT NULL DEFAULT 'active',
    metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, region, model_id, tier)
);

CREATE TABLE IF NOT EXISTS provider_model_capabilities (
    provider_model_id TEXT NOT NULL REFERENCES provider_models(id) ON DELETE CASCADE,
    capability_id     TEXT NOT NULL REFERENCES capabilities(id) ON DELETE RESTRICT,
    mode_metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (provider_model_id, capability_id)
);

-- Current installed Alibaba routes.  Region-specific availability remains
-- provider data and can be refreshed without changing application schemas.
INSERT INTO provider_models
    (id, provider, region, model_id, tier, operation, status)
VALUES
    ('alibaba:intl:qwen-audio-3.0-tts-flash', 'alibaba', 'intl',
     'qwen-audio-3.0-tts-flash', 'flash', 'voice_clone', 'active'),
    ('alibaba:intl:qwen3.5-omni-plus', 'alibaba', 'intl',
     'qwen3.5-omni-plus', 'plus', 'voice_clone', 'active'),
    ('alibaba:intl:qwen3.5-omni-flash', 'alibaba', 'intl',
     'qwen3.5-omni-flash', 'flash', 'voice_clone', 'active'),
    ('alibaba:intl:qwen3-tts-vc-2026-01-22', 'alibaba', 'intl',
     'qwen3-tts-vc-2026-01-22', 'vc', 'voice_clone', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO provider_model_capabilities (provider_model_id, capability_id)
VALUES
    ('alibaba:intl:qwen-audio-3.0-tts-flash', 'expressive_tags'),
    ('alibaba:intl:qwen3.5-omni-plus', 'natural_performance'),
    ('alibaba:intl:qwen3.5-omni-flash', 'natural_performance'),
    ('alibaba:intl:qwen3-tts-vc-2026-01-22', 'exact_longform')
ON CONFLICT DO NOTHING;

-- References retain storage provenance independently from the voice identity.
ALTER TABLE voice_references ADD COLUMN IF NOT EXISTS public_id UUID
    NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS voice_references_public_id_idx
    ON voice_references(public_id);
ALTER TABLE voice_references ADD COLUMN IF NOT EXISTS storage_backend TEXT
    NOT NULL DEFAULT 'filesystem';
ALTER TABLE voice_references ADD COLUMN IF NOT EXISTS storage_bucket TEXT;
ALTER TABLE voice_references ADD COLUMN IF NOT EXISTS storage_key TEXT;
ALTER TABLE voice_references ADD COLUMN IF NOT EXISTS diagnostics JSONB
    NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE voice_identities ADD COLUMN IF NOT EXISTS public_id UUID
    NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS voice_identities_public_id_idx
    ON voice_identities(public_id);
ALTER TABLE voice_identities ADD COLUMN IF NOT EXISTS preferred_reference_id TEXT;
ALTER TABLE voice_identities DROP CONSTRAINT IF EXISTS voice_identities_preferred_reference_fkey;
ALTER TABLE voice_identities ADD CONSTRAINT voice_identities_preferred_reference_fkey
    FOREIGN KEY (preferred_reference_id) REFERENCES voice_references(id)
    ON DELETE SET NULL;

-- A binding has its own durable identity.  The old provider/model primary key
-- remains temporarily as a compatibility bridge, never as the public ID.
ALTER TABLE voice_bindings ADD COLUMN IF NOT EXISTS id UUID
    NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS voice_bindings_id_idx ON voice_bindings(id);
ALTER TABLE voice_bindings ADD COLUMN IF NOT EXISTS provider_region TEXT
    NOT NULL DEFAULT 'intl';
ALTER TABLE voice_bindings ADD COLUMN IF NOT EXISTS provider_model_id TEXT
    REFERENCES provider_models(id) ON DELETE SET NULL;
ALTER TABLE voice_bindings ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE voice_bindings ADD COLUMN IF NOT EXISTS superseded_by UUID;
ALTER TABLE voice_bindings ADD COLUMN IF NOT EXISTS diagnostics JSONB
    NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE voice_bindings DROP CONSTRAINT IF EXISTS voice_bindings_superseded_by_fkey;
ALTER TABLE voice_bindings ADD CONSTRAINT voice_bindings_superseded_by_fkey
    FOREIGN KEY (superseded_by) REFERENCES voice_bindings(id) ON DELETE SET NULL;

UPDATE voice_bindings binding
   SET provider_model_id = model.id,
       provider_region = model.region
  FROM provider_models model
 WHERE binding.provider_model_id IS NULL
   AND model.provider = binding.provider
   AND model.model_id = binding.model_id
   AND model.tier = binding.tier;

-- Enrollment jobs snapshot the exact provider route and reference.  A newer
-- request never silently replaces an older ready binding.
ALTER TABLE voice_package_jobs ADD COLUMN IF NOT EXISTS provider TEXT
    NOT NULL DEFAULT 'alibaba';
ALTER TABLE voice_package_jobs ADD COLUMN IF NOT EXISTS provider_region TEXT
    NOT NULL DEFAULT 'intl';
ALTER TABLE voice_package_jobs ADD COLUMN IF NOT EXISTS provider_model_id TEXT
    REFERENCES provider_models(id) ON DELETE SET NULL;
ALTER TABLE voice_package_jobs ADD COLUMN IF NOT EXISTS classification TEXT
    NOT NULL DEFAULT 'documented';
ALTER TABLE voice_package_jobs ADD COLUMN IF NOT EXISTS binding_id UUID
    REFERENCES voice_bindings(id) ON DELETE SET NULL;
ALTER TABLE voice_package_jobs DROP CONSTRAINT IF EXISTS voice_package_jobs_identity_id_model_id_key;
CREATE INDEX IF NOT EXISTS voice_package_jobs_route_idx
    ON voice_package_jobs(identity_id, reference_id, provider, provider_region, model_id);

UPDATE voice_package_jobs job
   SET provider_model_id = model.id,
       provider_region = model.region
  FROM provider_models model
 WHERE job.provider_model_id IS NULL
   AND model.provider = job.provider
   AND model.model_id = job.model_id
   AND model.tier = job.tier;

UPDATE voice_package_jobs job
   SET binding_id = binding.id
  FROM voice_bindings binding
 WHERE job.binding_id IS NULL
   AND job.provider_voice_id = binding.provider_voice_id
   AND job.model_id = binding.model_id;

-- Venture-owned character library.
CREATE TABLE IF NOT EXISTS personas (
    id           BIGSERIAL PRIMARY KEY,
    public_id    UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    venture_id   BIGINT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    image        TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    aliases      JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes        TEXT NOT NULL DEFAULT '',
    presentation JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
    archived_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (venture_id, name)
);

CREATE TABLE IF NOT EXISTS project_personas (
    project_id BIGINT NOT NULL REFERENCES work_projects(id) ON DELETE CASCADE,
    persona_id BIGINT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, persona_id)
);

CREATE TABLE IF NOT EXISTS series_personas (
    series_id  BIGINT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    persona_id BIGINT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    PRIMARY KEY (series_id, persona_id)
);

CREATE TABLE IF NOT EXISTS production_cast_roles (
    id                        BIGSERIAL PRIMARY KEY,
    public_id                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    production_id             BIGINT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    persona_id                BIGINT REFERENCES personas(id) ON DELETE SET NULL,
    name                      TEXT NOT NULL,
    color                     TEXT NOT NULL DEFAULT '',
    position                  INTEGER,
    voice_source_kind         TEXT NOT NULL DEFAULT 'identity'
                              CHECK (voice_source_kind IN ('identity','catalogue')),
    voice_identity_id         TEXT REFERENCES voice_identities(id) ON DELETE SET NULL,
    catalogue_voice_id        TEXT,
    assignment_revision       INTEGER NOT NULL DEFAULT 1 CHECK (assignment_revision > 0),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((voice_source_kind = 'identity' AND catalogue_voice_id IS NULL)
        OR (voice_source_kind = 'catalogue' AND voice_identity_id IS NULL)),
    UNIQUE (production_id, name)
);

-- Give Parts stable IDs while preserving their current numeric API identity.
ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS id BIGINT;
UPDATE production_parts SET id = generation_id WHERE id IS NULL;
ALTER TABLE production_parts ALTER COLUMN id SET NOT NULL;
ALTER TABLE production_parts DROP CONSTRAINT IF EXISTS production_parts_pkey;
ALTER TABLE production_parts ADD CONSTRAINT production_parts_pkey PRIMARY KEY (id);
CREATE SEQUENCE IF NOT EXISTS production_parts_id_seq;
SELECT setval(
    'production_parts_id_seq',
    coalesce((SELECT max(id) FROM production_parts), 0) + 1,
    false
);
ALTER SEQUENCE production_parts_id_seq OWNED BY production_parts.id;
ALTER TABLE production_parts ALTER COLUMN id
    SET DEFAULT nextval('production_parts_id_seq');
ALTER TABLE production_parts ALTER COLUMN generation_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS production_parts_legacy_generation_idx
    ON production_parts(generation_id);
ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS public_id UUID
    NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS production_parts_public_id_idx
    ON production_parts(public_id);
ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS kind TEXT
    NOT NULL DEFAULT 'speech';
ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS script TEXT
    NOT NULL DEFAULT '';
ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS title TEXT
    NOT NULL DEFAULT '';
ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS cast_role_id BIGINT
    REFERENCES production_cast_roles(id) ON DELETE SET NULL;
ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS editorial_status TEXT
    NOT NULL DEFAULT 'draft';
ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS revision INTEGER
    NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS asset_id BIGINT
    REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS asset_version_id BIGINT
    REFERENCES asset_versions(id) ON DELETE SET NULL;
ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
    NOT NULL DEFAULT now();
ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

UPDATE production_parts part
   SET kind = CASE
           WHEN generation.kind = 'audio' THEN 'speech'
           ELSE coalesce(nullif(generation.kind, ''), 'speech') END,
       script = coalesce(generation.text, ''),
       title = coalesce(generation.title, ''),
       editorial_status = CASE WHEN generation.kind = 'draft' THEN 'draft' ELSE 'ready' END,
       asset_id = generation.asset_id,
       asset_version_id = generation.asset_version_id,
       duration_ms = generation.duration_ms,
       updated_at = generation.created_at
  FROM generations generation
 WHERE generation.id = part.generation_id;

-- Performances are immutable Takes.  Flexible provider-specific evidence is
-- kept in snapshot while core identity fields remain directly queryable.
CREATE TABLE IF NOT EXISTS takes (
    id                            BIGSERIAL PRIMARY KEY,
    public_id                     UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    part_id                       BIGINT NOT NULL REFERENCES production_parts(id) ON DELETE CASCADE,
    legacy_generation_id          BIGINT UNIQUE REFERENCES generations(id) ON DELETE SET NULL,
    source_part_revision          INTEGER NOT NULL,
    source_script_hash            TEXT NOT NULL,
    cast_assignment_revision      INTEGER,
    persona_id                    BIGINT REFERENCES personas(id) ON DELETE SET NULL,
    persona_name_snapshot         TEXT,
    cast_role_id                  BIGINT REFERENCES production_cast_roles(id) ON DELETE SET NULL,
    cast_role_name_snapshot       TEXT,
    voice_identity_id             TEXT REFERENCES voice_identities(id) ON DELETE SET NULL,
    voice_name_snapshot           TEXT,
    reference_id                  TEXT REFERENCES voice_references(id) ON DELETE SET NULL,
    binding_id                    UUID REFERENCES voice_bindings(id) ON DELETE SET NULL,
    catalogue_voice_id            TEXT,
    binding_resolution_status     TEXT NOT NULL DEFAULT 'resolved',
    capability_id                 TEXT REFERENCES capabilities(id) ON DELETE SET NULL,
    capability_name_snapshot      TEXT,
    provider                      TEXT,
    provider_region               TEXT,
    provider_voice_id             TEXT,
    model_id                      TEXT,
    tier                          TEXT,
    language                      TEXT,
    raw_text                      TEXT,
    spoken_text                   TEXT,
    tagged_text                   TEXT,
    delivery                      JSONB NOT NULL DEFAULT '{}'::jsonb,
    segmentation                  JSONB NOT NULL DEFAULT '{}'::jsonb,
    usage                         JSONB NOT NULL DEFAULT '{}'::jsonb,
    cost                          NUMERIC(12,6) NOT NULL DEFAULT 0,
    cost_basis                    TEXT NOT NULL DEFAULT 'unknown',
    diagnostics                   JSONB NOT NULL DEFAULT '{}'::jsonb,
    filename                      TEXT NOT NULL DEFAULT '',
    path                          TEXT NOT NULL DEFAULT '',
    size_bytes                    BIGINT NOT NULL DEFAULT 0,
    duration_ms                   INTEGER,
    snapshot                      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS takes_part_idx ON takes(part_id, created_at DESC);
CREATE INDEX IF NOT EXISTS takes_binding_idx ON takes(binding_id);

-- Current and archived historical speech are connected only where the exact
-- binding is certain.  Unknown reference relationships remain unresolved.
INSERT INTO takes
    (part_id, legacy_generation_id, source_part_revision, source_script_hash,
     voice_identity_id, voice_name_snapshot, reference_id, binding_id,
     binding_resolution_status, provider, provider_region, provider_voice_id,
     model_id, tier, language, raw_text, spoken_text, tagged_text, delivery,
     usage, cost, cost_basis, diagnostics, filename, path, size_bytes,
     duration_ms, snapshot, created_at)
SELECT part.id, generation.id, part.revision,
       encode(digest(coalesce(generation.text, ''), 'sha256'), 'hex'),
       generation.voice_identity_id,
       coalesce(identity.name, generation.voice),
       binding.reference_id, binding.id,
       CASE WHEN binding.id IS NULL THEN 'unresolved' ELSE 'resolved' END,
       coalesce(binding.provider, 'alibaba'), binding.provider_region,
       generation.voice,
       coalesce(binding.model_id, generation.model),
       coalesce(binding.tier, generation.model), generation.language,
       generation.text_raw, generation.text_shaped, generation.text_tagged,
       jsonb_build_object(
           'instruction', generation.instruction,
           'speech_mode', generation.speech_mode,
           'rate', generation.rate,
           'pitch', generation.pitch,
           'volume', generation.volume,
           'seed', generation.seed),
       coalesce(generation.usage, '{}'::jsonb), generation.cost,
       coalesce(generation.cost_basis, 'historical_generation'),
       jsonb_build_object(
           'provider_text', generation.provider_text,
           'fidelity', generation.fidelity,
           'failures', generation.failures),
       generation.filename, generation.path, generation.size_bytes,
       generation.duration_ms, to_jsonb(generation), generation.created_at
  FROM production_parts part
  JOIN generations root ON root.id = part.generation_id
  JOIN generations generation
    ON generation.id = root.id OR generation.version_of = root.id
  LEFT JOIN voice_identities identity ON identity.id = generation.voice_identity_id
  LEFT JOIN LATERAL (
      SELECT candidate.*
        FROM voice_bindings candidate
       WHERE candidate.identity_id = generation.voice_identity_id
         AND candidate.provider_voice_id = generation.voice
         AND (candidate.model_id = generation.model OR candidate.tier = generation.model)
       ORDER BY candidate.created_at DESC
       LIMIT 1
  ) binding ON true
 WHERE part.kind = 'speech'
   AND coalesce(generation.filename, '') <> ''
ON CONFLICT (legacy_generation_id) DO NOTHING;

ALTER TABLE production_parts ADD COLUMN IF NOT EXISTS selected_take_id BIGINT;
ALTER TABLE production_parts DROP CONSTRAINT IF EXISTS production_parts_selected_take_fkey;
ALTER TABLE production_parts ADD CONSTRAINT production_parts_selected_take_fkey
    FOREIGN KEY (selected_take_id) REFERENCES takes(id) ON DELETE SET NULL;

UPDATE production_parts part
   SET selected_take_id = take.id
  FROM takes take
 WHERE take.part_id = part.id
   AND take.legacy_generation_id = part.generation_id
   AND part.selected_take_id IS NULL;

CREATE TABLE IF NOT EXISTS composition_drafts (
    id          BIGSERIAL PRIMARY KEY,
    public_id   UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    part_id     BIGINT UNIQUE REFERENCES production_parts(id) ON DELETE CASCADE,
    production_id BIGINT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    insert_at   INTEGER,
    state       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO composition_drafts (part_id, production_id, state, created_at, updated_at)
SELECT part.id, part.production_id,
       jsonb_build_object(
           'text', generation.text,
           'text_raw', generation.text_raw,
           'text_shaped', generation.text_shaped,
           'text_tagged', generation.text_tagged,
           'text_state', generation.text_state,
           'voice_identity_id', generation.voice_identity_id,
           'legacy_voice', generation.voice,
           'legacy_engine', generation.engine,
           'legacy_model', generation.model,
           'language', generation.language,
           'instruction', generation.instruction,
           'format', generation.format),
       generation.created_at, generation.created_at
  FROM production_parts part
  JOIN generations generation ON generation.id = part.generation_id
 WHERE part.kind = 'draft'
ON CONFLICT (part_id) DO NOTHING;

-- Significant paid/state-changing provider calls are first-class evidence.
CREATE TABLE IF NOT EXISTS provider_attempts (
    id                    BIGSERIAL PRIMARY KEY,
    public_id             UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    job_id                BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    previous_attempt_id   BIGINT REFERENCES provider_attempts(id) ON DELETE SET NULL,
    operation             TEXT NOT NULL,
    provider              TEXT NOT NULL,
    provider_region       TEXT,
    route                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    provider_request_id   TEXT,
    idempotency_key       TEXT,
    payload_fingerprint   TEXT NOT NULL,
    status                TEXT NOT NULL
                          CHECK (status IN ('not_sent','sent','succeeded',
                                            'definitive_failed','ambiguous')),
    usage                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    estimated_cost        NUMERIC(12,6) NOT NULL DEFAULT 0,
    cost                  NUMERIC(12,6),
    cost_basis            TEXT NOT NULL DEFAULT 'unknown',
    error                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    diagnostics           JSONB NOT NULL DEFAULT '{}'::jsonb,
    sent_at               TIMESTAMPTZ,
    finished_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_attempts_job_idx
    ON provider_attempts(job_id, created_at);

ALTER TABLE takes ADD COLUMN IF NOT EXISTS provider_attempt_id BIGINT
    REFERENCES provider_attempts(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS part_id BIGINT
    REFERENCES production_parts(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS take_id BIGINT
    REFERENCES takes(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS provider_attempt_id BIGINT
    REFERENCES provider_attempts(id) ON DELETE SET NULL;

UPDATE jobs job
   SET part_id = part.id
  FROM production_parts part
 WHERE job.generation_id = part.generation_id
   AND job.part_id IS NULL;

UPDATE jobs job
   SET take_id = take.id
  FROM takes take
 WHERE job.generation_id = take.legacy_generation_id
   AND job.take_id IS NULL;

-- Existing significant provider Jobs become attempts only when their status
-- proves an actual business operation was run. Read-only probes are excluded.
INSERT INTO provider_attempts
    (job_id, operation, provider, provider_region, route,
     provider_request_id, idempotency_key, payload_fingerprint, status,
     usage, estimated_cost, cost, cost_basis, error, diagnostics,
     sent_at, finished_at, created_at)
SELECT job.id, job.kind, 'alibaba', job.provider_region,
       coalesce(job.resolved_route, job.requested_route, '{}'::jsonb),
       job.provider_request_id, job.idempotency_key,
       coalesce(job.idempotency_fingerprint,
                encode(digest(coalesce(job.payload::text, ''), 'sha256'), 'hex')),
       CASE
         WHEN job.status IN ('ok','warning') THEN 'succeeded'
         WHEN job.status IN ('failed','blocked','cancelled','lost') THEN 'definitive_failed'
         WHEN job.status = 'running' THEN 'sent'
         ELSE 'not_sent'
       END,
       coalesce(job.usage, '{}'::jsonb), coalesce(job.estimated, 0),
       job.cost, coalesce(job.cost_basis, 'unknown'),
       CASE WHEN coalesce(job.error, '') = '' THEN '{}'::jsonb
            ELSE jsonb_build_object('message', job.error) END,
       coalesce(job.result, '{}'::jsonb), job.started_at, job.finished_at,
       job.created_at
  FROM jobs job
 WHERE job.kind IN ('speech','batch','transcribe','translate','rewrite','voice_clone')
   AND job.status NOT IN ('queued','retrying')
   AND NOT EXISTS (
       SELECT 1 FROM provider_attempts attempt WHERE attempt.job_id = job.id)
ON CONFLICT DO NOTHING;

UPDATE jobs job
   SET provider_attempt_id = attempt.id
  FROM provider_attempts attempt
 WHERE attempt.job_id = job.id
   AND job.provider_attempt_id IS NULL;

UPDATE takes take
   SET provider_attempt_id = job.provider_attempt_id
  FROM jobs job
 WHERE job.take_id = take.id
   AND take.provider_attempt_id IS NULL;

-- Budget reservations prevent concurrent workers from passing the same cap.
CREATE TABLE IF NOT EXISTS budget_reservations (
    id              BIGSERIAL PRIMARY KEY,
    public_id       UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    job_id          BIGINT UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    operation       TEXT NOT NULL,
    estimated_cost  NUMERIC(12,6) NOT NULL CHECK (estimated_cost >= 0),
    actual_cost     NUMERIC(12,6),
    status          TEXT NOT NULL DEFAULT 'reserved'
                    CHECK (status IN ('reserved','reconciled','released','ambiguous')),
    confirmed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- New provider models can be enrolled across the existing library without
-- rebuilding identities or uploading their masters again.
CREATE TABLE IF NOT EXISTS enrollment_campaigns (
    id                BIGSERIAL PRIMARY KEY,
    public_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    provider_model_id TEXT NOT NULL REFERENCES provider_models(id) ON DELETE RESTRICT,
    status            TEXT NOT NULL DEFAULT 'draft',
    estimated_cost    NUMERIC(12,6) NOT NULL DEFAULT 0,
    confirmed_at      TIMESTAMPTZ,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enrollment_campaign_items (
    campaign_id   BIGINT NOT NULL REFERENCES enrollment_campaigns(id) ON DELETE CASCADE,
    identity_id   TEXT NOT NULL REFERENCES voice_identities(id) ON DELETE CASCADE,
    reference_id  TEXT NOT NULL REFERENCES voice_references(id) ON DELETE RESTRICT,
    classification TEXT NOT NULL CHECK (classification IN ('documented','experimental')),
    package_job_id TEXT REFERENCES voice_package_jobs(id) ON DELETE SET NULL,
    status         TEXT NOT NULL DEFAULT 'selected',
    PRIMARY KEY (campaign_id, identity_id, reference_id)
);
