CREATE OR REPLACE FUNCTION migrate_sound_scene_v1(
    scene_production_id BIGINT,
    scene_document JSONB
) RETURNS JSONB AS $$
DECLARE
    result_tracks JSONB := '[]'::jsonb;
    result_clips JSONB;
    track_document JSONB;
    clip_document JSONB;
    anchor_document JSONB;
    anchor_part_public_id UUID;
BEGIN
    FOR track_document IN
        SELECT value
          FROM jsonb_array_elements(coalesce(scene_document->'tracks', '[]'::jsonb))
    LOOP
        result_clips := '[]'::jsonb;
        FOR clip_document IN
            SELECT value
              FROM jsonb_array_elements(coalesce(track_document->'clips', '[]'::jsonb))
        LOOP
            anchor_document := clip_document->'anchor';
            IF anchor_document->>'kind' = 'part'
               AND anchor_document ? 'part_id' THEN
                SELECT public_id
                  INTO anchor_part_public_id
                  FROM production_parts
                 WHERE production_id = scene_production_id
                   AND id = (anchor_document->>'part_id')::bigint;
                IF anchor_part_public_id IS NOT NULL THEN
                    anchor_document := (
                        anchor_document - 'part_id'
                    ) || jsonb_build_object(
                        'part_public_id', anchor_part_public_id::text
                    );
                    clip_document := jsonb_set(
                        clip_document, '{anchor}', anchor_document, true);
                END IF;
            END IF;
            result_clips := result_clips || jsonb_build_array(clip_document);
        END LOOP;
        track_document := jsonb_set(
            track_document || jsonb_build_object(
                'volume', coalesce((track_document->>'volume')::numeric, 1)
            ),
            '{clips}', result_clips, true
        );
        result_tracks := result_tracks || jsonb_build_array(track_document);
    END LOOP;
    RETURN jsonb_set(scene_document, '{tracks}', result_tracks, true);
END;
$$ LANGUAGE plpgsql;

UPDATE sound_scenes
   SET document = migrate_sound_scene_v1(production_id, document);

UPDATE sound_scene_history
   SET document = migrate_sound_scene_v1(production_id, document);

DROP FUNCTION migrate_sound_scene_v1(BIGINT, JSONB);
