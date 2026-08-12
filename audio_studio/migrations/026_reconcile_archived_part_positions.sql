-- Migration 025 established this invariant. Reconcile once more for Parts
-- archived by a still-running pre-025 API between migration and deployment.
UPDATE production_parts
   SET archived_position = coalesce(archived_position, position),
       position = NULL
 WHERE archived_at IS NOT NULL
   AND position IS NOT NULL;
