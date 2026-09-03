import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowLeft, Captions, ChevronRight, Clapperboard, FileAudio2, FileImage,
  FileText, FileVideo2, Folder, FolderKanban, FolderPlus, Plus, Unlink,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { ErrorState, PageLoading } from "@/components/state-panel"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CreateProductionDialog } from "@/features/productions/create-production-dialog"
import { CreateFolderDialog } from "@/features/workspace/explorer/create-folder-dialog"
import { rememberedWorkspaceId, rememberWorkspace } from "@/features/workspace/workspace-selection"
import { useAsyncAction } from "@/hooks/use-async-action"
import { originsApi } from "@/lib/api"
import { formatDuration, formatUpdated } from "@/lib/format"
import { cn } from "@/lib/utils"
import type {
  ProjectDetail, ProjectProductionSummary, WorkspaceFile, WorkspaceOverview,
  WorkspaceProduction,
} from "@/types/domain"
import "./project-page.css"

const fileIcons: Record<string, LucideIcon> = {
  audio: FileAudio2,
  image: FileImage,
  video: FileVideo2,
  subtitle: Captions,
  document: FileText,
}

function ProductionRow({ production, onDetach }: {
  production: ProjectProductionSummary
  onDetach: (production: ProjectProductionSummary) => void
}) {
  return <article className="project-resource-row">
    <span className="project-resource-icon is-production"><Clapperboard /></span>
    <span className="project-resource-copy"><b>{production.name}</b><small>Audiovisual Production</small></span>
    <span className="project-resource-meta">{formatUpdated(production.updated_at) || "Recently"}</span>
    <OperatorIconButton label={`Remove ${production.name} from Project`} detail="The Production and all creative state remain intact." variant="ghost" size="icon-sm" onClick={() => onDetach(production)}><Unlink /></OperatorIconButton>
    <Button asChild variant="ghost" size="icon-sm" aria-label={`Open Production ${production.name}`}><Link to={`/origins/productions/audiovisual/${production.public_id}`}><ChevronRight /></Link></Button>
  </article>
}

function FileRow({ file }: { file: WorkspaceFile }) {
  const family = file.media_type || "other"
  const FileIcon = fileIcons[family] || FileText
  return <article className="project-resource-row">
    <span className={cn("project-resource-icon", `is-${family}`)}><FileIcon /></span>
    <span className="project-resource-copy"><b>{file.name}</b><small>{family}{file.duration_ms ? ` · ${formatDuration(file.duration_ms / 1000)}` : ""}</small></span>
    <span className="project-resource-meta">{file.source}</span>
  </article>
}

export function ProjectPage() {
  const { identifier = "" } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceOverview | null>(null)
  const [error, setError] = useState("")
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [productionDialogOpen, setProductionDialogOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const action = useAsyncAction<string>()

  const load = useCallback(async () => {
    setError("")
    try {
      const nextProject = await originsApi.project(identifier)
      setProject(nextProject)
      if (rememberedWorkspaceId() !== nextProject.workspace_id) {
        rememberWorkspace(nextProject.workspace_id)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to open this Project.")
    }
  }, [identifier])

  useEffect(() => {
    setProject(null)
    setWorkspace(null)
    void load()
  }, [load])

  const requestedFolderPublicId = searchParams.get("folder")
  const projectFolders = useMemo(() => project?.folders.filter((folder) =>
    folder.workspace_id === project.workspace_id
    && folder.project_id === project.id) || [], [project])
  const currentFolder = projectFolders.find((folder) =>
    folder.public_id === requestedFolderPublicId) || null
  const currentFolderId = currentFolder?.id ?? null
  const setFolderLocation = useCallback((folderPublicId: string | null, replace = false) => {
    const next = new URLSearchParams(searchParams)
    if (folderPublicId) next.set("folder", folderPublicId)
    else next.delete("folder")
    setSearchParams(next, { replace })
  }, [searchParams, setSearchParams])
  useEffect(() => {
    if (project && requestedFolderPublicId && !currentFolder) {
      setFolderLocation(null, true)
    }
  }, [currentFolder, project, requestedFolderPublicId, setFolderLocation])
  const childFolders = useMemo(() => projectFolders.filter(
    (folder) => folder.parent_id === currentFolderId,
  ), [currentFolderId, projectFolders])
  const productions = useMemo(() => project?.productions.filter(
    (production) => production.folder_id === currentFolderId,
  ) || [], [currentFolderId, project])
  const files = useMemo(() => currentFolderId === null ? [] : project?.files.filter(
    (file) => file.folder_id === currentFolderId,
  ) || [], [currentFolderId, project])
  const breadcrumbs = useMemo(() => {
    if (!project || currentFolderId === null) return []
    const result = []
    const visited = new Set<number>()
    let folder = projectFolders.find((candidate) => candidate.id === currentFolderId)
    while (folder && !visited.has(folder.id)) {
      visited.add(folder.id)
      result.unshift(folder)
      folder = folder.parent_id === null
        ? undefined
        : projectFolders.find((candidate) => candidate.id === folder?.parent_id)
    }
    return result
  }, [currentFolderId, project, projectFolders])
  const available = useMemo(() => workspace?.productions.filter(
    (production) => production.project_id === null,
  ) || [], [workspace])

  function folderCreated(folder: ProjectDetail["folders"][number]) {
    setProject((current) => current
      ? { ...current, folders: [...current.folders, folder] }
      : current)
    setFolderLocation(folder.public_id)
  }

  async function openExistingPicker() {
    setPickerOpen(true)
    if (!project || workspace) return
    try {
      setWorkspace(await originsApi.workspace(project.workspace_id))
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Productions could not be loaded.")
    }
  }

  async function setMembership(
    production: ProjectProductionSummary | WorkspaceProduction,
    projectId: number | null,
  ) {
    await action.run(`production-${production.id}`, async () => {
      try {
        await originsApi.updateProduction(production.id, projectId === null
          ? { project_id: null }
          : { project_id: projectId, folder_id: currentFolderId })
        if (workspace) {
          setWorkspace({
            ...workspace,
            productions: workspace.productions.filter((item) => item.id !== production.id),
          })
        }
        await load()
        toast.success(projectId ? "Production added to Project." : "Production removed from Project.")
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : "Project membership could not be changed.")
      }
    })
  }

  if (error && !project) return <ErrorState title="Project unavailable" message={error} retry={() => void load()} />
  if (!project) return <PageLoading label="Opening Project" />

  const locationLabel = currentFolder
    ? `${project.name} / ${breadcrumbs.map((folder) => folder.name).join(" / ")}`
    : project.name
  return <main className="project-page">
    <header className="project-page-header">
      <Button asChild variant="ghost" size="icon-sm" aria-label="Back to Projects"><Link to="/origins/projects"><ArrowLeft /></Link></Button>
      <span className="project-page-icon"><FolderKanban /></span>
      <div><small>Project</small><h1>{project.name}</h1><p>{project.description || "A focused home for related creative work."}</p></div>
      <span className="project-page-count">{project.production_count} Production{project.production_count === 1 ? "" : "s"}</span>
    </header>

    <div className="project-explorer">
      <nav className="project-breadcrumbs" aria-label="Project location">
        <button type="button" aria-current={currentFolderId === null ? "page" : undefined} onClick={() => setFolderLocation(null)}>{project.name}</button>
        {breadcrumbs.map((folder) => <span key={folder.id}><ChevronRight /><button type="button" aria-current={folder.id === currentFolderId ? "page" : undefined} onClick={() => setFolderLocation(folder.public_id)}>{folder.name}</button></span>)}
      </nav>
      <div className="project-explorer-actions">
        <Button variant="outline" onClick={() => setFolderDialogOpen(true)}><FolderPlus /> New Folder</Button>
        <Button onClick={() => setProductionDialogOpen(true)}><Plus /> New Production</Button>
        <Button variant="ghost" onClick={() => void openExistingPicker()}>Add existing</Button>
      </div>

      <section className="project-explorer-section" aria-labelledby="project-folders-title">
        <header><div><h2 id="project-folders-title">Folders</h2><p>{currentFolder ? `Inside ${currentFolder.name}` : "Organize references, drafts and deliverables."}</p></div><span>{childFolders.length}</span></header>
        <div className="project-folder-grid">
          {childFolders.map((folder) => <button type="button" key={folder.id} onClick={() => setFolderLocation(folder.public_id)}><span><Folder /></span><b>{folder.name}</b><ChevronRight /></button>)}
          {!childFolders.length && <div className="project-compact-empty"><Folder /><span>No folders at this level.</span></div>}
        </div>
      </section>

      <section className="project-explorer-section" aria-labelledby="project-productions-title">
        <header><div><h2 id="project-productions-title">Productions</h2><p>Creative working environments at this level.</p></div><span>{productions.length}</span></header>
        <div className="project-resource-list">
          {productions.map((production) => <ProductionRow key={production.id} production={production} onDetach={(item) => void setMembership(item, null)} />)}
          {!productions.length && <div className="project-compact-empty"><Clapperboard /><span>No Productions at this level.</span></div>}
        </div>
      </section>

      {currentFolderId !== null && <section className="project-explorer-section" aria-labelledby="project-files-title">
        <header><div><h2 id="project-files-title">Files</h2><p>Workspace-owned Files placed in this Folder.</p></div><span>{files.length}</span></header>
        <div className="project-resource-list">
          {files.map((file) => <FileRow key={file.id} file={file} />)}
          {!files.length && <div className="project-compact-empty"><FileImage /><span>No Files in this Folder.</span></div>}
        </div>
      </section>}
    </div>

    <CreateFolderDialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen} workspaceId={project.workspace_id} projectId={project.id} parentId={currentFolderId} locationLabel={locationLabel} onCreated={folderCreated} />
    <CreateProductionDialog open={productionDialogOpen} onOpenChange={setProductionDialogOpen} workspaceId={project.workspace_id} projects={[project]} folders={projectFolders} initialProjectId={project.id} initialFolderId={currentFolderId} lockProject onCreated={(production) => navigate(`/origins/productions/audiovisual/${production.public_id}`)} />

    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
      <DialogContent className="project-production-picker">
        <DialogHeader><DialogTitle>Add an existing Production</DialogTitle><DialogDescription>Move a standalone Production into this Project without copying its creative state.</DialogDescription></DialogHeader>
        <div className="project-production-options">
          {!workspace && <p>Loading standalone Productions…</p>}
          {available.map((production) => <ActionButton key={production.id} variant="outline" busy={action.isPending(`production-${production.id}`)} busyLabel="Adding…" onClick={() => void setMembership(production, project.id)}><Clapperboard /><span><b>{production.name}</b><small>Audiovisual Production</small></span><Plus /></ActionButton>)}
          {workspace && !available.length && <p>No standalone Productions are available.</p>}
        </div>
      </DialogContent>
    </Dialog>
  </main>
}
