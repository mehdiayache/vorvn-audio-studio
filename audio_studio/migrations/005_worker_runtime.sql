CREATE TABLE IF NOT EXISTS worker_leases (
    worker_id       TEXT PRIMARY KEY,
    process_id      INTEGER NOT NULL,
    status          TEXT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    detail          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS worker_leases_last_seen_idx
    ON worker_leases(last_seen_at DESC);
