-- Preserve both immutable source objects for every Voice Reference.
-- storage_key/sha256 remain compatibility aliases for the normalized master.

ALTER TABLE voice_references
    ADD COLUMN IF NOT EXISTS original_storage_key TEXT,
    ADD COLUMN IF NOT EXISTS normalized_storage_key TEXT,
    ADD COLUMN IF NOT EXISTS original_sha256 TEXT,
    ADD COLUMN IF NOT EXISTS normalized_sha256 TEXT,
    ADD COLUMN IF NOT EXISTS original_size_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS normalized_size_bytes BIGINT;

UPDATE voice_references
   SET normalized_storage_key = coalesce(normalized_storage_key, storage_key),
       normalized_sha256 = coalesce(normalized_sha256, sha256)
 WHERE normalized_storage_key IS NULL OR normalized_sha256 IS NULL;

