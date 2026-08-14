-- Audio Studio now assigns an exact Voice directly to each speech recording.
-- Retain immutable Voice/provider snapshots on Takes while removing the
-- superseded Persona and Production Cast assignment model.

ALTER TABLE production_parts
    DROP COLUMN IF EXISTS cast_role_id;

ALTER TABLE takes
    DROP COLUMN IF EXISTS cast_assignment_revision,
    DROP COLUMN IF EXISTS persona_id,
    DROP COLUMN IF EXISTS persona_name_snapshot,
    DROP COLUMN IF EXISTS cast_role_id,
    DROP COLUMN IF EXISTS cast_role_name_snapshot;

DROP TABLE IF EXISTS production_cast_roles;
DROP TABLE IF EXISTS project_personas;
DROP TABLE IF EXISTS series_personas;
DROP TABLE IF EXISTS personas;
