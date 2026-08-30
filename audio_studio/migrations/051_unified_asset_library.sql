-- One Venture Asset Library replaces the storage-shaped Intros/Outros/Music/
-- Stingers navigation. Audio meaning lives on the Asset; intro/outro are usage
-- tags, not separate media families.
ALTER TABLE asset_collections
    DROP CONSTRAINT IF EXISTS asset_collections_kind_check;
ALTER TABLE asset_collections
    ADD CONSTRAINT asset_collections_kind_check
    CHECK (kind IN ('assets','intros','outros','music','stingers','other'));

UPDATE assets
   SET tags = array_append(tags, kind)
 WHERE kind IN ('intro', 'outro')
   AND NOT (kind = ANY(tags));
UPDATE assets SET kind = 'music' WHERE kind IN ('intro', 'outro');
UPDATE assets SET kind = 'audio'
 WHERE media_type = 'audio' AND kind = 'other';

UPDATE asset_collections SET kind = 'assets', name = 'Assets'
 WHERE kind = 'stingers';
UPDATE projects SET name = 'Assets', system_role = 'assets:assets'
 WHERE system_role = 'assets:stingers';

UPDATE assets asset
   SET collection_id = target.id
  FROM asset_collections source, asset_collections target
 WHERE asset.collection_id = source.id
   AND source.venture_id = target.venture_id
   AND target.kind = 'assets'
   AND source.id <> target.id;

DELETE FROM asset_collections WHERE kind <> 'assets';
