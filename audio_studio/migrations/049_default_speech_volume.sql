-- New speech starts at full provider volume. Existing recordings retain the
-- explicit value captured when they were generated.
ALTER TABLE generations ALTER COLUMN volume SET DEFAULT 100;
ALTER TABLE blocks ALTER COLUMN volume SET DEFAULT 100;
