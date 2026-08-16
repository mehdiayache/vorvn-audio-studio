-- Qwen 3.5 Omni is not an exact-text speech engine and is no longer an
-- installed Audio Studio capability. Remove its runtime catalogue and any
-- remaining historical provider state. Voice identities and source references
-- are intentionally preserved so their exact Qwen Audio / Qwen3 TTS bindings
-- remain usable.

CREATE TEMP TABLE retired_omni_jobs ON COMMIT DROP AS
SELECT id, public_id
  FROM jobs
 WHERE engine = 'omni'
    OR model ILIKE '%omni%'
    OR provider_voice_id ILIKE 'qwen-omni%'
    OR payload->>'engine' = 'omni'
    OR payload->>'model' ILIKE '%omni%'
    OR payload->>'model_id' ILIKE '%omni%'
    OR payload->>'provider_model_id' ILIKE '%omni%'
    OR payload->>'provider_voice_id' ILIKE 'qwen-omni%'
    OR payload->>'catalogue_voice_id' ILIKE '%omni%'
    OR payload->>'voice_package_job_id' IN (
        SELECT id FROM voice_package_jobs
         WHERE engine = 'omni'
            OR adapter_key = 'omni'
            OR model_id ILIKE '%omni%')
    OR EXISTS (
        SELECT 1
          FROM jsonb_array_elements_text(
               CASE WHEN jsonb_typeof(payload->'models') = 'array'
                    THEN payload->'models' ELSE '[]'::jsonb END) AS item(model)
         WHERE item.model ILIKE '%omni%')
    OR result->>'engine' = 'omni'
    OR result->>'model' ILIKE '%omni%'
    OR result->>'model_id' ILIKE '%omni%'
    OR result->>'provider_voice_id' ILIKE 'qwen-omni%'
    OR requested_route->>'engine' = 'omni'
    OR requested_route->>'adapter_key' = 'omni'
    OR requested_route->>'model' ILIKE '%omni%'
    OR requested_route->>'model_id' ILIKE '%omni%'
    OR requested_route->>'provider_model_id' ILIKE '%omni%'
    OR requested_route->>'provider_voice_id' ILIKE 'qwen-omni%'
    OR resolved_route->>'engine' = 'omni'
    OR resolved_route->>'adapter_key' = 'omni'
    OR resolved_route->>'model' ILIKE '%omni%'
    OR resolved_route->>'model_id' ILIKE '%omni%'
    OR resolved_route->>'provider_model_id' ILIKE '%omni%'
    OR resolved_route->>'provider_voice_id' ILIKE 'qwen-omni%';

CREATE TEMP TABLE retired_omni_clips ON COMMIT DROP AS
SELECT id
  FROM clips
 WHERE model_id ILIKE '%omni%'
    OR provider_voice_id ILIKE 'qwen-omni%'
    OR snapshot->>'engine' = 'omni'
    OR snapshot->>'model' ILIKE '%omni%'
    OR snapshot->>'model_id' ILIKE '%omni%'
    OR snapshot->>'provider_voice_id' ILIKE 'qwen-omni%';

DELETE FROM transcripts
 WHERE clip_id IN (SELECT id FROM retired_omni_clips)
    OR source_job_id IN (SELECT id FROM retired_omni_jobs);

DELETE FROM clips WHERE id IN (SELECT id FROM retired_omni_clips);

DELETE FROM provider_attempts
 WHERE job_id IN (SELECT id FROM retired_omni_jobs)
    OR route->>'engine' = 'omni'
    OR route->>'adapter_key' = 'omni'
    OR route->>'model' ILIKE '%omni%'
    OR route->>'model_id' ILIKE '%omni%'
    OR route->>'provider_model_id' ILIKE '%omni%'
    OR route->>'provider_voice_id' ILIKE 'qwen-omni%';

DELETE FROM audit_records
 WHERE resource_type = 'job'
   AND resource_id IN (
       SELECT id::text FROM retired_omni_jobs
       UNION ALL
       SELECT public_id::text FROM retired_omni_jobs);

DELETE FROM jobs WHERE id IN (SELECT id FROM retired_omni_jobs);

DELETE FROM generations
 WHERE engine = 'omni'
    OR model ILIKE '%omni%';

DELETE FROM voice_package_jobs
 WHERE engine = 'omni'
    OR adapter_key = 'omni'
    OR model_id ILIKE '%omni%'
    OR provider_voice_id ILIKE 'qwen-omni%';

DELETE FROM voice_bindings
 WHERE engine = 'omni'
    OR model_id ILIKE '%omni%'
    OR provider_voice_id ILIKE 'qwen-omni%';

DELETE FROM voices
 WHERE engine = 'omni'
    OR target_model ILIKE '%omni%'
    OR provider_voice_id ILIKE 'qwen-omni%';

DELETE FROM provider_catalogue_voices
 WHERE engine = 'omni'
    OR model_id ILIKE '%omni%'
    OR provider_voice_id ILIKE 'qwen-omni%';

DELETE FROM provider_models
 WHERE adapter_key = 'omni'
    OR model_id ILIKE '%omni%';

DELETE FROM capabilities WHERE id = 'natural_performance';

UPDATE series
   SET defaults = defaults - 'engine' - 'model'
 WHERE defaults->>'engine' = 'omni'
    OR defaults->>'model' ILIKE '%omni%';

UPDATE productions
   SET settings = settings - 'engine' - 'model'
 WHERE settings->>'engine' = 'omni'
    OR settings->>'model' ILIKE '%omni%';
