-- A cloned voice is reproducible only when its exact source recording remains
-- attached to every provider binding created from it. The source language
-- describes the recording; it never limits the languages later synthesized.
ALTER TABLE voice_references
    ADD COLUMN IF NOT EXISTS source_language TEXT;
ALTER TABLE voice_references
    ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE voice_references
    ADD COLUMN IF NOT EXISTS sha256 TEXT;
ALTER TABLE voice_references
    ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE voice_references
    ADD COLUMN IF NOT EXISTS sample_rate INTEGER;
ALTER TABLE voice_references
    ADD COLUMN IF NOT EXISTS channels INTEGER;
ALTER TABLE voice_references
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE voice_references
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE voice_bindings
    ADD COLUMN IF NOT EXISTS reference_id TEXT
    REFERENCES voice_references(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS voice_bindings_reference_idx
    ON voice_bindings(reference_id);

-- Preserve the language operators already assigned before provenance lived on
-- the recording itself. Unknown historic recordings remain explicit instead
-- of being guessed from the generated text.
UPDATE voice_references reference
   SET source_language = coalesce(
           nullif(reference.source_language, ''),
           nullif(identity.recording_language, ''),
           nullif(identity.metadata->>'language', '')
       ),
       updated_at = now()
  FROM voice_identities identity
 WHERE identity.id = reference.identity_id
   AND coalesce(reference.source_language, '') = '';

-- A binding can be safely backfilled only when its identity has exactly one
-- preserved master. Multiple masters require an operator decision.
WITH unique_reference AS (
    SELECT identity_id, min(id) AS reference_id
      FROM voice_references
     WHERE identity_id IS NOT NULL
     GROUP BY identity_id
    HAVING count(*) = 1
)
UPDATE voice_bindings binding
   SET reference_id = unique_reference.reference_id,
       updated_at = now()
  FROM unique_reference
 WHERE binding.identity_id = unique_reference.identity_id
   AND binding.reference_id IS NULL;
