-- Enrollment workers must receive the exact persisted adapter route rather
-- than reconstructing it from a legacy engine label.

ALTER TABLE voice_package_jobs
    ADD COLUMN IF NOT EXISTS adapter_key text;

UPDATE voice_package_jobs job
   SET adapter_key=coalesce(model.adapter_key, job.engine)
  FROM provider_models model
 WHERE model.id=job.provider_model_id
   AND job.adapter_key IS NULL;

UPDATE voice_package_jobs
   SET adapter_key=engine
 WHERE adapter_key IS NULL;

ALTER TABLE voice_package_jobs
    ALTER COLUMN adapter_key SET NOT NULL;
