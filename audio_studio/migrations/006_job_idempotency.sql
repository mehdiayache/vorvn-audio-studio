ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS idempotency_fingerprint TEXT;

DROP INDEX IF EXISTS jobs_idempotency_idx;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_organization_idempotency_idx
    ON jobs(organization_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND organization_id IS NOT NULL;
