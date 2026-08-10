-- A voice's team-facing editorial fit is independent from the language spoken
-- in any provider reference recording. Preserve today's visible qualification
-- while giving both concepts one explicit owner.
ALTER TABLE voice_identities
    ADD COLUMN IF NOT EXISTS editorial_language TEXT;

UPDATE voice_identities
   SET editorial_language = recording_language
 WHERE coalesce(editorial_language, '') = ''
   AND coalesce(recording_language, '') <> '';
