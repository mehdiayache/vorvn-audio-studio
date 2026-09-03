-- Project is the master work container. Folders belong either to the Workspace
-- root (project_id IS NULL) or to one Project. Existing resources are preserved.

ALTER TABLE public.folders ADD COLUMN project_id bigint;

ALTER TABLE public.folders
    ADD CONSTRAINT folders_id_workspace_id_key UNIQUE (id, workspace_id);

ALTER TABLE public.folders DROP CONSTRAINT folders_parent_id_fkey;

ALTER TABLE public.folders
    ADD CONSTRAINT folders_parent_workspace_id_fkey
    FOREIGN KEY (parent_id, workspace_id)
    REFERENCES public.folders (id, workspace_id)
    ON DELETE CASCADE;

ALTER TABLE public.folders
    ADD CONSTRAINT folders_project_workspace_id_fkey
    FOREIGN KEY (project_id, workspace_id)
    REFERENCES public.projects (id, workspace_id)
    ON DELETE SET NULL (project_id);

CREATE INDEX folders_project_parent_idx
    ON public.folders (project_id, parent_id, name, id);

DROP INDEX public.projects_folder_idx;
ALTER TABLE public.projects DROP CONSTRAINT projects_folder_id_fkey;
ALTER TABLE public.projects DROP COLUMN folder_id;

CREATE FUNCTION public.enforce_folder_context() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    parent_project_id bigint;
BEGIN
    IF NEW.parent_id IS NOT NULL THEN
        SELECT project_id
          INTO parent_project_id
          FROM public.folders
         WHERE id = NEW.parent_id
           AND workspace_id = NEW.workspace_id;

        IF NOT FOUND OR parent_project_id IS DISTINCT FROM NEW.project_id THEN
            RAISE EXCEPTION
                'A child Folder must share its parent Workspace and Project context.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.folders child
         WHERE child.parent_id = NEW.id
           AND (
               child.workspace_id <> NEW.workspace_id
               OR child.project_id IS DISTINCT FROM NEW.project_id
           )
    ) THEN
        RAISE EXCEPTION
            'A Folder cannot leave children in another Workspace or Project context.'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.productions production
         WHERE production.folder_id = NEW.id
           AND (
               production.workspace_id <> NEW.workspace_id
               OR production.project_id IS DISTINCT FROM NEW.project_id
           )
    ) THEN
        RAISE EXCEPTION
            'A Folder cannot leave Productions in another Workspace or Project context.'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER folders_context_consistency
    AFTER INSERT OR UPDATE ON public.folders
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.enforce_folder_context();

CREATE FUNCTION public.enforce_production_folder_context() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.folder_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM public.folders folder
         WHERE folder.id = NEW.folder_id
           AND folder.workspace_id = NEW.workspace_id
           AND folder.project_id IS NOT DISTINCT FROM NEW.project_id
    ) THEN
        RAISE EXCEPTION
            'A Production Folder must share its Workspace and Project context.'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER productions_folder_context_consistency
    AFTER INSERT OR UPDATE ON public.productions
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.enforce_production_folder_context();
