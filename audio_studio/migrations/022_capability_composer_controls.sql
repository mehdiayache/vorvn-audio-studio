-- Composer behavior belongs to the provider-neutral capability record.  The
-- provider adapter key remains execution plumbing and must not drive UI state.
UPDATE capabilities
   SET controls = '{"delivery_tags":true,"natural_direction":true,"direction_modes":["directed"],"rate":true,"pitch":true,"volume":true}'::jsonb,
       ui_metadata = '{"direction_label":"Voice direction"}'::jsonb,
       updated_at = now()
 WHERE id = 'expressive_tags';

UPDATE capabilities
   SET controls = '{"delivery_tags":false,"natural_direction":false,"direction_modes":["exact"],"rate":false,"pitch":false,"volume":false}'::jsonb,
       ui_metadata = '{"output_note":"The cloned voice and prepared script control the delivery. Precise numeric speed, pitch, and volume controls are unavailable."}'::jsonb,
       updated_at = now()
 WHERE id = 'exact_longform';

UPDATE capabilities
   SET controls = '{"delivery_tags":false,"natural_direction":true,"direction_modes":["exact","directed"],"rate":false,"pitch":false,"volume":false,"verified_passages":true}'::jsonb,
       ui_metadata = '{"direction_label":"Overall performance direction","exact_help":"Audio Studio reads the script in short passages and verifies every returned transcript before assembling the Take.","directed_help":"The same verified-passage process is used with one overall natural-language direction. Inline emotion tags are unavailable.","output_note":"Pace, emotion, and volume come from the natural-language direction. Precise numeric controls are unavailable."}'::jsonb,
       updated_at = now()
 WHERE id = 'natural_performance';
