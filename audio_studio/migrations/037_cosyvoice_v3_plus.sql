-- Install the exact Singapore/International CosyVoice V3 Plus route.

INSERT INTO capabilities (id, name, description, controls, ui_metadata)
VALUES (
    'controlled_exact',
    'Controlled exact reading',
    'Faithful cloned-voice speech with precise native delivery controls.',
    '{"delivery_tags":false,"natural_direction":false,"direction_modes":["exact"],"rate":true,"pitch":true,"volume":true,"seed":true,"ssml":true,"word_timestamps":true,"language_hints":true}'::jsonb,
    '{"output_note":"Supports precise speed, pitch, volume, repeatable seed, SSML and captured word timing."}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    name=EXCLUDED.name,
    description=EXCLUDED.description,
    controls=EXCLUDED.controls,
    ui_metadata=EXCLUDED.ui_metadata,
    archived_at=NULL,
    updated_at=now();

INSERT INTO provider_models
    (id, provider, region, model_id, tier, operation,
     enrollment_languages, output_languages, limits, segmentation, pricing,
     status, adapter_key, enrollment_supported, metadata)
VALUES (
    'alibaba:intl:cosyvoice-v3-plus', 'alibaba', 'intl',
    'cosyvoice-v3-plus', 'plus', 'voice_clone',
    '["zh","en","fr","de","ja","ko","ru"]'::jsonb,
    '["Chinese","English","French","German","Japanese","Korean","Russian"]'::jsonb,
    '{"characters_per_submission":20000,"characters_per_session":200000,"seed_min":0,"seed_max":65535}'::jsonb,
    '{"mode":"continuous_session","characters_per_submission":20000,"characters_per_session":200000,"ssml_submissions_per_session":1}'::jsonb,
    '{"speech_per_million_chars":26.0,"enrollment_cost_usd":0}'::jsonb,
    'active', 'cosyvoice', true,
    '{"model_label":"CosyVoice V3 Plus","streaming_word_timestamps":true,"ssml":true,"instruction_control":false,"inline_tags":false}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    operation=EXCLUDED.operation,
    enrollment_languages=EXCLUDED.enrollment_languages,
    output_languages=EXCLUDED.output_languages,
    limits=EXCLUDED.limits,
    segmentation=EXCLUDED.segmentation,
    pricing=EXCLUDED.pricing,
    status=EXCLUDED.status,
    adapter_key=EXCLUDED.adapter_key,
    enrollment_supported=EXCLUDED.enrollment_supported,
    metadata=EXCLUDED.metadata,
    updated_at=now();

INSERT INTO provider_model_capabilities (provider_model_id, capability_id)
VALUES ('alibaba:intl:cosyvoice-v3-plus', 'controlled_exact')
ON CONFLICT DO NOTHING;

-- Repair identities whose one unambiguous reference predates the preferred
-- reference pointer. This lets the existing idempotent package workflow reuse it.
UPDATE voice_identities identity
   SET preferred_reference_id = candidate.reference_id,
       updated_at = now()
  FROM (
      SELECT identity_id, min(id) AS reference_id
        FROM voice_references
       GROUP BY identity_id
      HAVING count(*) = 1
  ) candidate
 WHERE identity.id = candidate.identity_id
   AND identity.preferred_reference_id IS NULL;
