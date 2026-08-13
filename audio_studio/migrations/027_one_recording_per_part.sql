-- Production Speech Parts own one active recording. Historical paid-operation
-- evidence remains in Jobs and provider_attempts; alternative Take rows are no
-- longer a product concept or a persistence option.
WITH ranked AS (
    SELECT take.id,
           row_number() OVER (
               PARTITION BY take.part_id
               ORDER BY CASE WHEN take.id = part.selected_take_id THEN 0 ELSE 1 END,
                        take.created_at DESC,
                        take.id DESC
           ) AS keep_rank
      FROM takes take
      JOIN production_parts part ON part.id = take.part_id
)
DELETE FROM takes take
 USING ranked
 WHERE take.id = ranked.id
   AND ranked.keep_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS takes_one_recording_per_part_idx
    ON takes(part_id);

COMMENT ON TABLE takes IS
    'Internal provider snapshot for the single active recording of a Speech Part.';
