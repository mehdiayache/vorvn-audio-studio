-- `voice_bindings.languages` is synthesis capability, not recording
-- provenance. Older rows stored only the enrollment language there.
UPDATE voice_bindings
   SET languages = '["Chinese","English","Japanese","Korean","German","French","Italian","Russian","Portuguese","Thai","Indonesian","Malay","Vietnamese"]'::jsonb,
       updated_at = now()
 WHERE engine = 'audio';

UPDATE voice_bindings
   SET languages = '["Chinese","English","German","Italian","Portuguese","Spanish","Japanese","Korean","French","Russian","Thai","Indonesian","Arabic","Czech","Danish","Dutch","Finnish","Hebrew","Hindi","Icelandic","Malay","Norwegian","Persian","Polish","Swedish","Tagalog","Turkish","Urdu","Vietnamese"]'::jsonb,
       updated_at = now()
 WHERE engine = 'omni';
