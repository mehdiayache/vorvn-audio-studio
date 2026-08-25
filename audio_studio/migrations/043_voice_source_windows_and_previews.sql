-- Preserve long Voice masters while making every enrollment input explicit.
CREATE TABLE voice_reference_windows (
    id TEXT PRIMARY KEY,
    reference_id TEXT NOT NULL REFERENCES voice_references(id) ON DELETE CASCADE,
    provider_model_id TEXT,
    start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
    duration_ms INTEGER NOT NULL CHECK (duration_ms BETWEEN 1000 AND 60000),
    source_language TEXT,
    transcript TEXT,
    enable_preprocess BOOLEAN,
    derived_path TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX voice_reference_windows_scope_unique
    ON voice_reference_windows (reference_id, coalesce(provider_model_id, ''));

ALTER TABLE voice_package_jobs
    ADD COLUMN reference_window_id TEXT
        REFERENCES voice_reference_windows(id) ON DELETE RESTRICT;

ALTER TABLE voice_bindings
    ADD COLUMN reference_window_id TEXT
        REFERENCES voice_reference_windows(id) ON DELETE SET NULL;

-- Rebuilding a provider method must never replace the audible Production
-- truth before an operator has heard and approved the candidate.
ALTER TABLE voice_bindings
    ADD COLUMN validation_state TEXT NOT NULL DEFAULT 'approved';

ALTER TABLE voice_bindings
    ADD CONSTRAINT voice_bindings_validation_state_check
    CHECK (validation_state IN ('approved', 'candidate', 'rejected', 'superseded'));

-- Earlier builds allowed more than one live binding for the same method. The
-- newest one is the method operators were most recently given; preserve it as
-- approved and retain older bindings for historical Clips.
WITH ranked AS (
    SELECT id,
           first_value(id) OVER (
               PARTITION BY identity_id,provider,provider_region,model_id
               ORDER BY created_at DESC,id DESC
           ) AS newest_id,
           row_number() OVER (
               PARTITION BY identity_id,provider,provider_region,model_id
               ORDER BY created_at DESC,id DESC
           ) AS position
      FROM voice_bindings
     WHERE archived_at IS NULL
)
UPDATE voice_bindings binding
   SET validation_state='superseded',superseded_by=ranked.newest_id
  FROM ranked
 WHERE binding.id=ranked.id AND ranked.position>1;

CREATE UNIQUE INDEX voice_bindings_one_approved_method
    ON voice_bindings (identity_id,provider,provider_region,model_id)
    WHERE validation_state = 'approved' AND archived_at IS NULL;

CREATE TABLE voice_previews (
    id UUID PRIMARY KEY,
    identity_id TEXT NOT NULL REFERENCES voice_identities(id) ON DELETE CASCADE,
    binding_id UUID NOT NULL REFERENCES voice_bindings(id) ON DELETE CASCADE,
    job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    tag TEXT,
    text TEXT NOT NULL,
    instruction TEXT,
    seed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued',
    approval_state TEXT NOT NULL DEFAULT 'unreviewed',
    filename TEXT,
    duration_ms INTEGER,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status IN ('queued', 'running', 'ready', 'failed')),
    CHECK (approval_state IN ('unreviewed', 'approved', 'rejected'))
);

CREATE INDEX voice_previews_identity_created
    ON voice_previews (identity_id, created_at DESC);

-- Existing references receive one conservative, editable default window.
INSERT INTO voice_reference_windows
    (id, reference_id, start_ms, duration_ms, source_language, transcript,
     metadata)
SELECT 'vwin_' || md5(reference.id || ':default'), reference.id, 0,
       greatest(1000,least(coalesce(reference.duration_ms,20000),20000)),
       reference.source_language, reference.transcript,
       jsonb_build_object('created_by', 'migration-default')
  FROM voice_references reference
ON CONFLICT DO NOTHING;

UPDATE voice_package_jobs job
   SET reference_window_id = source_window.id
  FROM voice_reference_windows source_window
 WHERE source_window.reference_id = job.reference_id
   AND source_window.provider_model_id IS NULL
   AND job.reference_window_id IS NULL;

UPDATE voice_bindings binding
   SET reference_window_id = source_window.id
  FROM voice_reference_windows source_window
 WHERE source_window.reference_id = binding.reference_id
   AND source_window.provider_model_id IS NULL
   AND binding.reference_window_id IS NULL;
