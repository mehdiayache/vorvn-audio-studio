-- A legacy lost worker cannot prove that an already-started provider call
-- failed before billing.  Preserve it as ambiguous rather than definitive.

UPDATE provider_attempts attempt
   SET status='ambiguous',
       cost=greatest(coalesce(attempt.cost,0), attempt.estimated_cost),
       error=attempt.error || jsonb_build_object(
           'reason','legacy_worker_lost',
           'message','The historical worker stopped after this provider operation began.')
  FROM jobs job
 WHERE attempt.job_id=job.id
   AND job.status='lost'
   AND attempt.status='definitive_failed';

-- Enrollment classification is derived from provider facts, never supplied
-- by a browser checkbox.
UPDATE provider_models
   SET enrollment_languages=CASE adapter_key
       WHEN 'audio' THEN '["zh","en","ja","ko","de","fr","it","ru","pt","th","id","ms","vi"]'::jsonb
       WHEN 'omni' THEN '["zh","en","de","it","pt","es","ja","ko","fr","ru","th","id","ar","cs","da","nl","fi","he","hi","is","ms","no","fa","pl","sv","tl","tr","ur","vi"]'::jsonb
       WHEN 'qwen_tts' THEN '["zh","en","de","it","pt","es","ja","ko","fr","ru"]'::jsonb
       ELSE enrollment_languages END
 WHERE enrollment_supported;
