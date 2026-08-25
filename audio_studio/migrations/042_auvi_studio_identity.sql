-- Keep persisted capability guidance aligned with the current product name.
UPDATE capabilities
   SET ui_metadata = jsonb_set(
           ui_metadata,
           '{exact_help}',
           to_jsonb('Auvi Studio reads the script in short passages and verifies every returned transcript before assembling the recording.'::text)
       ),
       updated_at = now()
 WHERE id = 'natural_performance'
   AND ui_metadata ? 'exact_help';
