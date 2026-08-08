CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS organization_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS requested_route JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS resolved_route JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS provider_request_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS provider_region TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS provider_endpoint TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS price_version TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS output_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS retries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_public_id_idx ON jobs(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_idempotency_idx
    ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_queue_idx
    ON jobs(status, available_at, created_at)
    WHERE status IN ('queued', 'retrying');

CREATE TABLE IF NOT EXISTS job_events (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind TEXT NOT NULL,
    progress REAL,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS job_events_job_idx ON job_events(job_id, id);

CREATE TABLE IF NOT EXISTS audit_records (
    id BIGSERIAL PRIMARY KEY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id TEXT,
    organization_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    request_id TEXT,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audit_records_resource_idx
    ON audit_records(resource_type, resource_id, created_at DESC);
