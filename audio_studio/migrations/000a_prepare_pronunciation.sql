-- The extracted baseline reflects the final BOOLEAN column, while migration
-- 004 intentionally owns the historical TEXT -> BOOLEAN conversion. A fresh
-- database must briefly reproduce that pre-004 type. Existing installations
-- that already applied 004 are left untouched.
DO $$
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM schema_migrations
       WHERE version = '004_pronunciation_phoneme_boolean.sql'
  ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'pronunciations'
         AND column_name = 'phoneme' AND data_type = 'boolean'
  ) THEN
    ALTER TABLE pronunciations ALTER COLUMN phoneme DROP DEFAULT;
    ALTER TABLE pronunciations ALTER COLUMN phoneme TYPE TEXT
      USING CASE WHEN phoneme THEN 'true' ELSE 'false' END;
  END IF;
END
$$;
