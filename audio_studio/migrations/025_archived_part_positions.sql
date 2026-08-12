-- Archived Parts remain durable history, but their former sequence position
-- must not compete with the active Production sequence. Preserve the former
-- position explicitly for future restore/audit workflows and release the
-- active unique slot.
ALTER TABLE production_parts
    ADD COLUMN IF NOT EXISTS archived_position INTEGER;

UPDATE production_parts
   SET archived_position = coalesce(archived_position, position),
       position = NULL
 WHERE archived_at IS NOT NULL
   AND position IS NOT NULL;

COMMENT ON COLUMN production_parts.archived_position IS
    'Sequence position at archive time; never participates in the active sequence.';
