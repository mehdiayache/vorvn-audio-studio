-- Keep the temporary legacy Project mirror compatible with canonical Space
-- ownership. This trigger is removed with ventures/work_projects; until then,
-- every old writer still produces a valid Space-owned Project.

CREATE OR REPLACE FUNCTION sync_production_space() RETURNS trigger AS $$
BEGIN
  IF NEW.space_id IS NULL OR (
      TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id
  ) THEN
    SELECT work_project.venture_id
      INTO NEW.space_id
      FROM work_projects work_project
     WHERE work_project.id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS production_space_before ON productions;
CREATE TRIGGER production_space_before
BEFORE INSERT OR UPDATE OF project_id, space_id ON productions
FOR EACH ROW EXECUTE FUNCTION sync_production_space();
