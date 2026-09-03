-- The former model allowed Project membership and Folder placement to diverge.
-- Keep every Production, but clear only placements that cannot exist in the new
-- Project → Folder hierarchy.

UPDATE public.productions production
   SET folder_id = NULL,
       updated_at = now()
 WHERE production.folder_id IS NOT NULL
   AND NOT EXISTS (
       SELECT 1
         FROM public.folders folder
        WHERE folder.id = production.folder_id
          AND folder.workspace_id = production.workspace_id
          AND folder.project_id IS NOT DISTINCT FROM production.project_id
   );
