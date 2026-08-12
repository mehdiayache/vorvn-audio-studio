-- Series may suggest editorial context, but must never select an exact speech
-- route. Preserve only output language and a certain Voice Identity match.
WITH legacy_matches AS (
    SELECT series.id AS series_id, min(identity.id) AS identity_id
      FROM series
      JOIN voice_identities identity
        ON lower(identity.name) = lower(nullif(series.defaults->>'voice', ''))
       AND identity.status = 'active'
     GROUP BY series.id
    HAVING count(*) = 1
),
safe_defaults AS (
    SELECT series.id,
           jsonb_strip_nulls(jsonb_build_object(
               'language', nullif(btrim(series.defaults->>'language'), ''),
               'voice_identity_id', coalesce(
                   (
                       SELECT identity.id
                         FROM voice_identities identity
                        WHERE identity.id = nullif(series.defaults->>'voice_identity_id', '')
                          AND identity.status = 'active'
                   ),
                   legacy_matches.identity_id
               )
           )) AS defaults
      FROM series
      LEFT JOIN legacy_matches ON legacy_matches.series_id = series.id
)
UPDATE series
   SET defaults = safe_defaults.defaults,
       updated_at = CASE
           WHEN series.defaults IS DISTINCT FROM safe_defaults.defaults THEN now()
           ELSE series.updated_at
       END
  FROM safe_defaults
 WHERE series.id = safe_defaults.id;
