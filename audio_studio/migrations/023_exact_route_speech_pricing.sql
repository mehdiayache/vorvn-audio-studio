-- Cost estimates belong to the exact provider-model route, not to a UI
-- adapter branch.
UPDATE provider_models
   SET pricing = pricing || jsonb_build_object(
       'speech_per_million_chars',
       CASE model_id
         WHEN 'qwen-audio-3.0-tts-flash' THEN 15.0
         WHEN 'qwen3.5-omni-plus' THEN 48.0
         WHEN 'qwen3.5-omni-flash' THEN 14.0
         WHEN 'qwen3-tts-vc-2026-01-22' THEN 11.5
         ELSE coalesce((pricing->>'speech_per_million_chars')::numeric, 0)
       END),
       updated_at = now()
 WHERE provider='alibaba' AND region='intl';
