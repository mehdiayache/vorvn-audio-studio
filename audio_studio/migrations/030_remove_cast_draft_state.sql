-- Preserve operator drafts while removing the retired Cast selection key from
-- their recoverable JSON state. No text, Voice route or delivery state changes.

UPDATE composer_working_drafts
   SET state = state - 'cast_role_id', updated_at = now()
 WHERE state ? 'cast_role_id';

UPDATE composition_drafts
   SET state = state - 'cast_role_id', updated_at = now()
 WHERE state ? 'cast_role_id';
