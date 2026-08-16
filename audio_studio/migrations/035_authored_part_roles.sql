-- Optional script roles survive JSON import and recording without reviving
-- casting. They are authored labels only (for example Narrator or Esther).
ALTER TABLE production_parts
    ADD COLUMN IF NOT EXISTS authored_role TEXT;

