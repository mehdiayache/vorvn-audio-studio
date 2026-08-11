-- Canonical application discovery reads installed enrollment methods only from
-- provider_models. Provider-specific facts are populated here/in catalogue
-- refreshes, never reconstructed by the Voice application service.

UPDATE provider_models
   SET output_languages='["Chinese","English","Japanese","Korean","German","French","Italian","Russian","Portuguese","Thai","Indonesian","Malay","Vietnamese"]'::jsonb,
       metadata=metadata || '{"model_label":"Qwen Audio TTS · Flash"}'::jsonb,
       updated_at=now()
 WHERE id='alibaba:intl:qwen-audio-3.0-tts-flash';

UPDATE provider_models
   SET output_languages='["Chinese","English","German","Italian","Portuguese","Spanish","Japanese","Korean","French","Russian","Thai","Indonesian","Arabic","Czech","Danish","Dutch","Finnish","Hebrew","Hindi","Icelandic","Malay","Norwegian","Persian","Polish","Swedish","Tagalog","Turkish","Urdu","Vietnamese"]'::jsonb,
       metadata=metadata || jsonb_build_object(
           'model_label', CASE tier
               WHEN 'plus' THEN 'Qwen 3.5 Omni · Plus'
               ELSE 'Qwen 3.5 Omni · Flash' END),
       updated_at=now()
 WHERE id IN ('alibaba:intl:qwen3.5-omni-plus',
              'alibaba:intl:qwen3.5-omni-flash');

UPDATE provider_models
   SET output_languages='["Chinese","English","German","Italian","Portuguese","Spanish","Japanese","Korean","French","Russian"]'::jsonb,
       metadata=metadata || '{"model_label":"Qwen3 TTS Voice Clone"}'::jsonb,
       updated_at=now()
 WHERE id='alibaba:intl:qwen3-tts-vc-2026-01-22';
