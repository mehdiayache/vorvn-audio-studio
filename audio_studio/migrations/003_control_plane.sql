ALTER TABLE jobs ADD COLUMN IF NOT EXISTS operation_label TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_tool TEXT;

UPDATE jobs SET actor_id = 'local-owner' WHERE actor_id IS NULL;
UPDATE jobs SET organization_id = 'local-studio' WHERE organization_id IS NULL;
ALTER TABLE jobs ALTER COLUMN actor_id SET DEFAULT 'local-owner';
ALTER TABLE jobs ALTER COLUMN organization_id SET DEFAULT 'local-studio';

ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS source_job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS provider_region TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS price_version TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS catalog_rate NUMERIC(16, 9);
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS catalog_cost NUMERIC(12, 6) NOT NULL DEFAULT 0;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS cost_basis TEXT NOT NULL DEFAULT 'unknown';

CREATE UNIQUE INDEX IF NOT EXISTS transcripts_public_id_idx ON transcripts(public_id);
CREATE INDEX IF NOT EXISTS transcripts_source_job_idx ON transcripts(source_job_id);
CREATE INDEX IF NOT EXISTS jobs_actor_idx ON jobs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_organization_idx ON jobs(organization_id, created_at DESC);

UPDATE transcripts transcript
   SET source_job_id = job.id,
       model = coalesce(transcript.model, job.model),
       provider_region = coalesce(transcript.provider_region, job.provider_region),
       price_version = coalesce(transcript.price_version, 'legacy-estimate'),
       catalog_cost = CASE WHEN transcript.catalog_cost = 0 THEN coalesce(job.cost, 0) ELSE transcript.catalog_cost END,
       cost_basis = CASE WHEN transcript.cost_basis = 'unknown' THEN coalesce(job.cost_basis, 'historical') ELSE transcript.cost_basis END
  FROM jobs job
 WHERE job.kind = 'transcribe'
   AND (job.result->>'id') ~ '^[0-9]+$'
   AND (job.result->>'id')::bigint = transcript.id
   AND transcript.source_job_id IS NULL;

UPDATE jobs
   SET output_ids = jsonb_build_array(jsonb_build_object('type', 'transcript', 'id', (result->>'id')::bigint))
 WHERE kind = 'transcribe'
   AND (result->>'id') ~ '^[0-9]+$'
   AND output_ids = '[]'::jsonb;

