-- Standalone Speak sessions are durable Job groupings. This keeps every paid
-- attempt in the existing ledger without creating a parallel media model.
CREATE INDEX IF NOT EXISTS jobs_speak_session_idx
    ON jobs ((payload->>'session_id'), created_at DESC)
    WHERE kind = 'speech' AND source_tool = 'speak' AND production_id IS NULL;
