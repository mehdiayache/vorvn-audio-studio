-- Durable Jobs keep provider and spend evidence, but no longer expose the
-- removed multi-Take selection contract through their JSON payloads.
UPDATE jobs
   SET result = (result - 'take_id' - 'takes' - 'selected')
                || CASE WHEN result ? 'take_id'
                        THEN jsonb_build_object('clip_id', result->'take_id')
                        ELSE '{}'::jsonb END
 WHERE result ?| ARRAY['take_id', 'takes', 'selected'];

UPDATE jobs
   SET payload = payload - 'select_result'
 WHERE payload ? 'select_result';

UPDATE jobs
   SET result = jsonb_set(
       result,
       '{warning}',
       to_jsonb(replace(
           replace(
               result->>'warning',
               'Alternative Take created without changing or selecting the Part.',
               'This historical result is not the Part''s current recording.'
           ),
           'Take',
           'recording'
       ))
   )
 WHERE result->>'warning' LIKE '%Take%';
