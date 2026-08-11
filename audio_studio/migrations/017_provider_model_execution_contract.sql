-- Provider models own their execution adapter and enrollment availability.
-- Runtime code must never infer these values from a model-name substring.

ALTER TABLE provider_models
    ADD COLUMN IF NOT EXISTS adapter_key TEXT,
    ADD COLUMN IF NOT EXISTS enrollment_supported BOOLEAN NOT NULL DEFAULT false;

UPDATE provider_models
   SET adapter_key = CASE model_id
       WHEN 'qwen-audio-3.0-tts-flash' THEN 'audio'
       WHEN 'qwen3.5-omni-plus' THEN 'omni'
       WHEN 'qwen3.5-omni-flash' THEN 'omni'
       WHEN 'qwen3-tts-vc-2026-01-22' THEN 'qwen_tts'
       ELSE adapter_key END,
       enrollment_supported = CASE
           WHEN operation = 'voice_clone' THEN true
           ELSE enrollment_supported END
 WHERE provider = 'alibaba' AND region = 'intl';

