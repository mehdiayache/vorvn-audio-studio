-- Freesound taxonomy is provider provenance, not an Auvi classification.
-- Preserve historical provider tags before clearing fields that only the user owns.
UPDATE assets
   SET metadata = jsonb_set(
           COALESCE(metadata, '{}'::jsonb),
           '{source_tags}',
           to_jsonb(COALESCE(tags, ARRAY[]::text[])),
           true
       )
 WHERE media_type = 'audio'
   AND lower(COALESCE(metadata->>'origin', metadata->>'provider', '')) = 'freesound'
   AND NOT COALESCE(metadata, '{}'::jsonb) ? 'source_tags';

UPDATE assets
   SET category = NULL,
       tags = ARRAY[]::text[]
 WHERE media_type = 'audio'
   AND lower(COALESCE(metadata->>'origin', metadata->>'provider', '')) = 'freesound';
