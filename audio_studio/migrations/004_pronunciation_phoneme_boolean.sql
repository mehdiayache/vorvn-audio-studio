ALTER TABLE pronunciations
    ALTER COLUMN phoneme TYPE BOOLEAN
    USING lower(coalesce(phoneme, '')) IN ('true', 't', '1', 'yes', 'on');

ALTER TABLE pronunciations
    ALTER COLUMN phoneme SET DEFAULT false,
    ALTER COLUMN phoneme SET NOT NULL;
