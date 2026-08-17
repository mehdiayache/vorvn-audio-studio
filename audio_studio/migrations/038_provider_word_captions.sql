-- Record how caption timing was obtained without overloading billing fields.

ALTER TABLE transcripts
    ADD COLUMN IF NOT EXISTS timing_source TEXT;

COMMENT ON COLUMN transcripts.timing_source IS
    'Timing provenance, for example provider_word_timestamps or transcription.';
