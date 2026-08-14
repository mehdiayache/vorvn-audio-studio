-- A Speech Part owns at most one recording Clip. The former selected Take
-- pointer was redundant once alternatives were removed.
ALTER TABLE production_parts
    DROP CONSTRAINT IF EXISTS production_parts_selected_take_fkey;
ALTER TABLE production_parts
    DROP COLUMN IF EXISTS selected_take_id;

ALTER TABLE takes RENAME TO clips;

ALTER TABLE clips RENAME CONSTRAINT takes_pkey TO clips_pkey;
ALTER TABLE clips RENAME CONSTRAINT takes_public_id_key TO clips_public_id_key;
ALTER TABLE clips RENAME CONSTRAINT takes_part_id_fkey TO clips_part_id_fkey;
ALTER TABLE clips RENAME CONSTRAINT takes_legacy_generation_id_key TO clips_legacy_generation_id_key;
ALTER TABLE clips RENAME CONSTRAINT takes_legacy_generation_id_fkey TO clips_legacy_generation_id_fkey;
ALTER TABLE clips RENAME CONSTRAINT takes_voice_identity_id_fkey TO clips_voice_identity_id_fkey;
ALTER TABLE clips RENAME CONSTRAINT takes_reference_id_fkey TO clips_reference_id_fkey;
ALTER TABLE clips RENAME CONSTRAINT takes_binding_id_fkey TO clips_binding_id_fkey;
ALTER TABLE clips RENAME CONSTRAINT takes_capability_id_fkey TO clips_capability_id_fkey;
ALTER TABLE clips RENAME CONSTRAINT takes_provider_attempt_id_fkey TO clips_provider_attempt_id_fkey;

ALTER INDEX takes_part_idx RENAME TO clips_part_idx;
ALTER INDEX takes_binding_idx RENAME TO clips_binding_idx;
ALTER INDEX takes_one_recording_per_part_idx RENAME TO clips_one_recording_per_part_idx;

ALTER TABLE jobs RENAME COLUMN take_id TO clip_id;
ALTER TABLE jobs RENAME CONSTRAINT jobs_take_id_fkey TO jobs_clip_id_fkey;
ALTER TABLE transcripts RENAME COLUMN take_id TO clip_id;
ALTER TABLE transcripts RENAME CONSTRAINT transcripts_take_id_fkey TO transcripts_clip_id_fkey;
ALTER INDEX transcripts_take_idx RENAME TO transcripts_clip_idx;

ALTER TABLE clips
    ADD COLUMN start_time_ms BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN file_url TEXT NOT NULL DEFAULT '';
UPDATE clips SET file_url = '/audio/' || filename WHERE filename <> '';

COMMENT ON TABLE clips IS
    'The single recording asset attached to a Speech Part.';
