-- Lightweight recoverable Composer state. This is neither Part truth nor Job
-- history: it only records what an operator is currently preparing.
CREATE TABLE IF NOT EXISTS composer_working_drafts (
    id                           BIGSERIAL PRIMARY KEY,
    public_id                    UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    context_key                  TEXT NOT NULL UNIQUE,
    context_kind                 TEXT NOT NULL CHECK (context_kind IN ('standalone','production')),
    session_id                   UUID,
    production_id                BIGINT REFERENCES productions(id) ON DELETE CASCADE,
    part_id                      BIGINT REFERENCES production_parts(id) ON DELETE CASCADE,
    operation                    TEXT,
    insert_before_part_public_id UUID,
    state                        JSONB NOT NULL,
    version                      INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (context_kind = 'standalone' AND session_id IS NOT NULL
         AND production_id IS NULL AND part_id IS NULL AND operation IS NULL)
        OR
        (context_kind = 'production' AND session_id IS NULL
         AND production_id IS NOT NULL
         AND operation IN ('new_part','render_draft','new_take'))
    )
);

CREATE INDEX IF NOT EXISTS composer_working_drafts_production_idx
    ON composer_working_drafts (production_id, updated_at DESC);

