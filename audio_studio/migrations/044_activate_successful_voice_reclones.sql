-- A deliberate successful reclone is the new active method. Preserve the
-- previous binding for historical recordings, but do not require a second
-- hidden approval workflow before operators can use the result.
WITH newest_candidate AS (
    SELECT DISTINCT ON (identity_id,provider,provider_region,model_id)
           id,identity_id,provider,provider_region,model_id
      FROM voice_bindings
     WHERE validation_state='candidate' AND archived_at IS NULL
     ORDER BY identity_id,provider,provider_region,model_id,created_at DESC,id DESC
)
UPDATE voice_bindings current
   SET validation_state='superseded',superseded_by=candidate.id
  FROM newest_candidate candidate
 WHERE current.identity_id=candidate.identity_id
   AND current.provider=candidate.provider
   AND current.provider_region=candidate.provider_region
   AND current.model_id=candidate.model_id
   AND current.validation_state='approved'
   AND current.archived_at IS NULL
   AND current.id<>candidate.id;

WITH ranked_candidate AS (
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
     WHERE validation_state='candidate' AND archived_at IS NULL
)
UPDATE voice_bindings binding
   SET validation_state='superseded',superseded_by=ranked.newest_id
  FROM ranked_candidate ranked
 WHERE binding.id=ranked.id AND ranked.position>1;

UPDATE voice_bindings
   SET validation_state='approved',superseded_by=NULL
 WHERE validation_state='candidate' AND archived_at IS NULL;
