-- Provider-model pricing is provider catalogue data, not UI/domain constants.
UPDATE provider_models
   SET pricing = pricing || jsonb_build_object('enrollment_cost_usd',
       CASE model_id
         WHEN 'qwen-audio-3.0-tts-flash' THEN 0.0
         WHEN 'qwen3.5-omni-plus' THEN 0.01
         WHEN 'qwen3.5-omni-flash' THEN 0.01
         WHEN 'qwen3-tts-vc-2026-01-22' THEN 0.01
         ELSE coalesce((pricing->>'enrollment_cost_usd')::numeric, 0)
       END)
 WHERE provider='alibaba' AND region='intl';
