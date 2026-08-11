-- Durable media relations no longer use a Generation as a generic identity.

CREATE TABLE IF NOT EXISTS provider_catalogue_voices (
    id                TEXT PRIMARY KEY,
    provider          TEXT NOT NULL,
    region            TEXT NOT NULL,
    model_id          TEXT NOT NULL,
    tier              TEXT NOT NULL,
    provider_voice_id TEXT NOT NULL,
    engine            TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'active',
    languages         JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    refreshed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, region, model_id, tier, provider_voice_id)
);

ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS part_id BIGINT
    REFERENCES production_parts(id) ON DELETE SET NULL;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS take_id BIGINT
    REFERENCES takes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS transcripts_part_idx ON transcripts(part_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transcripts_take_idx ON transcripts(take_id, created_at DESC);

UPDATE transcripts transcript
   SET take_id = take.id,
       part_id = take.part_id
  FROM takes take
 WHERE transcript.generation_id = take.legacy_generation_id
   AND transcript.take_id IS NULL;

ALTER TABLE exports ADD COLUMN IF NOT EXISTS public_id UUID
    NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS exports_public_id_idx ON exports(public_id);

-- Old foreign keys stay nullable during the honest historical bridge, but new
-- application code writes only Part/Take/Asset/Export identities.
