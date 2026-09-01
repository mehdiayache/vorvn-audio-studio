-- Complete the temporary write bridge. Legacy fixtures and remaining callers
-- still create Ventures and Assets directly; mirror their root ownership into
-- the canonical Space contract until those callers are removed.

CREATE OR REPLACE FUNCTION sync_space_from_venture() RETURNS trigger AS $$
BEGIN
  INSERT INTO spaces
      (id, public_id, name, description, created_at, updated_at)
  VALUES
      (NEW.id, NEW.public_id, NEW.name, coalesce(NEW.description, ''),
       NEW.created_at, NEW.updated_at)
  ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS venture_space_after ON ventures;
CREATE TRIGGER venture_space_after
AFTER INSERT OR UPDATE OF name, description ON ventures
FOR EACH ROW EXECUTE FUNCTION sync_space_from_venture();

CREATE OR REPLACE FUNCTION sync_asset_space() RETURNS trigger AS $$
BEGIN
  IF NEW.space_id IS NULL OR (
      TG_OP = 'UPDATE' AND NEW.venture_id IS DISTINCT FROM OLD.venture_id
  ) THEN
    NEW.space_id := NEW.venture_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS asset_space_before ON assets;
CREATE TRIGGER asset_space_before
BEFORE INSERT OR UPDATE OF venture_id, space_id ON assets
FOR EACH ROW EXECUTE FUNCTION sync_asset_space();
