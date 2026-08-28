ALTER TABLE sound_scenes
    ADD COLUMN history_revision BIGINT;

UPDATE sound_scenes
   SET history_revision = revision;

ALTER TABLE sound_scenes
    ALTER COLUMN history_revision SET DEFAULT 1,
    ALTER COLUMN history_revision SET NOT NULL,
    ADD CHECK (history_revision > 0);
