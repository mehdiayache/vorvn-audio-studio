import { useMemo, useState } from "react"
import {
  Captions, ChevronRight, Clapperboard, FileAudio2, FileImage, FileText,
  FileVideo2, Folder, FolderPlus, Mic2, Music2, Plus, Search,
  Sparkles, Upload, WandSparkles, Waves, FolderKanban,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { FileDropZone } from "@/components/file-drop-zone"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  createLibraryQuery, LIBRARY_SOURCE_OPTIONS, LIBRARY_TYPE_OPTIONS, queryLibraryFiles,
  type LibrarySourceFilter, type LibraryTypeFilter,
} from "@/features/library/library-query"
import { useAsyncAction } from "@/hooks/use-async-action"
import { useWorkspaceExplorer } from "@/hooks/use-workspace-explorer"
import { originsApi } from "@/lib/api"
import { formatDuration, formatUpdated } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CreationActionSummary, WorkspaceFile, WorkspaceOverview, WorkspaceProduction, WorkspaceProject } from "@/types/domain"
import "./workspace-explorer.css"

export type WorkspaceExplorerView = "create" | "projects" | "productions" | "files"

const actionPresentation: Record<string, { icon: LucideIcon; href?: string; tone: string }> = {
  "generate-speech": { icon: Mic2, href: "/origins/create/generate-speech", tone: "speech" },
  "generate-music": { icon: Music2, href: "/origins/create/generate-music", tone: "music" },
  "generate-sound-effect": { icon: Waves, href: "/origins/create/generate-sound-effect", tone: "sound" },
  "generate-image": { icon: FileImage, href: "/origins/create/generate-image", tone: "image" },
  "generate-video": { icon: FileVideo2, href: "/origins/create/generate-video", tone: "video" },
  "create-subtitles": { icon: Captions, href: "/origins/create/create-subtitles", tone: "subtitle" },
}

type CreateShortcut = Pick<CreationActionSummary, "id" | "label" | "description">

function createShortcuts(actions: CreationActionSummary[]): CreateShortcut[] {
  const byId = new Map(actions.map((action) => [action.id, action]))
  return ["generate-speech", "generate-music", "generate-sound-effect", "generate-image", "generate-video", "create-subtitles"]
    .flatMap((id) => byId.get(id) ? [byId.get(id)!] : [])
}

const fileIcons: Record<string, LucideIcon> = {
  audio: FileAudio2,
  image: FileImage,
  video: FileVideo2,
  subtitle: Captions,
  document: FileText,
}

function CreateActionButton({ action, folderId }: {
  action: CreateShortcut
  folderId: number | null
}) {
  const presentation = actionPresentation[action.id] || { icon: Sparkles, tone: "other" }
  const Icon = presentation.icon
  const content = <><span className="workspace-create-action-icon"><Icon /></span><span><b>{action.label}</b><small>{action.description}</small></span><ChevronRight /></>
  const destination = presentation.href || `/origins/create/${action.id}`
  const href = folderId ? `${destination}?folder_id=${folderId}` : destination
  return <Button asChild variant="ghost" className={cn("workspace-create-action", `is-${presentation.tone}`)}><Link to={href}>{content}</Link></Button>
}

function ProductionRow({ production }: { production: WorkspaceProduction }) {
  return <article className="workspace-production-row">
    <Link to={`/origins/productions/audiovisual/${production.public_id}`} aria-label={`Open ${production.name}`} />
    <span className="workspace-production-icon"><Clapperboard /></span>
    <span className="workspace-production-copy"><b>{production.name}</b><small>Audiovisual Production</small></span>
    <span className="workspace-production-meta"><b>{formatUpdated(production.updated_at) || "Recently"}</b><small>{production.part_count} Part{production.part_count === 1 ? "" : "s"}</small></span>
    <ChevronRight />
  </article>
}

function ProjectRow({ project }: { project: WorkspaceProject }) {
  return <article className="workspace-production-row">
    <Link to={`/origins/projects/${project.public_id}`} aria-label={`Open Project ${project.name}`} />
    <span className="workspace-production-icon"><FolderKanban /></span>
    <span className="workspace-production-copy"><b>{project.name}</b><small>Project</small></span>
    <span className="workspace-production-meta"><b>{formatUpdated(project.updated_at) || "Recently"}</b><small>{project.production_count} Production{project.production_count === 1 ? "" : "s"}</small></span>
    <ChevronRight />
  </article>
}

function FileTile({ file }: { file: WorkspaceFile }) {
  const family = file.media_type || "other"
  const FileIcon = fileIcons[family] || FileText
  const visual = family === "image"
    ? <img src={file.url || ""} alt="" />
    : family === "video"
      ? <video src={file.url || ""} muted preload="metadata" />
      : <span className="workspace-file-art"><FileIcon /></span>
  return <article className={cn("workspace-file-tile", `is-${family}`)}>
    <div className="workspace-file-preview">{visual}<span className="workspace-file-source">{file.source}</span></div>
    <div><b title={file.name}>{file.name}</b><small>{family}{file.duration_ms ? ` · ${formatDuration(file.duration_ms / 1000)}` : ""}</small></div>
  </article>
}

function ExplorerContent({ workspaceOverview, view, actions, actionsError, onRetryActions, onNewProject, onNewProduction, onNewFolder, onUploadFile, selectedFolderId, onSelectedFolderId }: {
  workspaceOverview: WorkspaceOverview
  view: WorkspaceExplorerView
  actions: CreationActionSummary[]
  actionsError?: string
  onRetryActions: () => void
  onNewProduction: () => void
  onNewProject: () => void
  onNewFolder: () => void
  onUploadFile: () => void
  selectedFolderId: number | null
  onSelectedFolderId: (folderId: number | null) => void
}) {
  const [query, setQuery] = useState("")
  const [fileType, setFileType] = useState<LibraryTypeFilter>("all")
  const [fileSource, setFileSource] = useState<LibrarySourceFilter>("all")
  const normalizedQuery = query.trim().toLowerCase()
  const projects = workspaceOverview.projects.filter((project) =>
    (selectedFolderId === null || project.folder_id === selectedFolderId)
    && (!normalizedQuery || project.name.toLowerCase().includes(normalizedQuery)))
  const productions = workspaceOverview.productions.filter((production) =>
    (selectedFolderId === null || production.folder_id === selectedFolderId)
    && (!normalizedQuery || production.name.toLowerCase().includes(normalizedQuery)))
  const libraryQuery = useMemo(() => createLibraryQuery({
    search: query,
    type: fileType,
    source: fileSource,
    folder: selectedFolderId === null ? "all" : String(selectedFolderId) as `${number}`,
  }), [fileSource, fileType, query, selectedFolderId])
  const files = useMemo(() => queryLibraryFiles(workspaceOverview.files, libraryQuery), [libraryQuery, workspaceOverview.files])
  const showProjects = view === "projects"
  const showProductions = view === "create" || view === "productions"
  const showFiles = view === "create" || view === "files"

  return <>
    {view === "create" && <section className="workspace-create-stage" aria-labelledby="workspace-create-title">
      <span className="workspace-create-kicker"><WandSparkles /> Create</span>
      <h1 id="workspace-create-title">What do you want to create?</h1>
      <p>Start with an idea or open an audiovisual Production. Files stay reusable across this Workspace.</p>
      <div className="workspace-create-action-catalog" role="list">
        <Button className="workspace-create-action is-production" variant="ghost" onClick={onNewProduction}><span className="workspace-create-action-icon"><Clapperboard /></span><span><b>New audiovisual production</b><small>Script, Timeline, Library, Preview and Export in one Production.</small></span><ChevronRight /></Button>
        <Button className="workspace-create-action is-upload" variant="ghost" onClick={onUploadFile}><span className="workspace-create-action-icon"><Upload /></span><span><b>Upload a File</b><small>Add an existing file directly to this Workspace.</small></span><ChevronRight /></Button>
        {createShortcuts(actions).map((action) => <CreateActionButton action={action} folderId={selectedFolderId} key={action.id} />)}
      </div>
      {actionsError && <div className="workspace-create-inline-error" role="alert"><span>{actionsError}</span><Button variant="ghost" size="sm" onClick={onRetryActions}>Try again</Button></div>}
    </section>}

    <div className="workspace-library-toolbar">
      <label><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${view === "projects" ? "Projects" : view === "productions" ? "Productions" : view === "files" ? "Files" : "this Workspace"}`} /></label>
      {showFiles && <Select value={fileType} onValueChange={(value) => setFileType(value as LibraryTypeFilter)}><SelectTrigger aria-label="File type"><SelectValue /></SelectTrigger><SelectContent>{LIBRARY_TYPE_OPTIONS.map((item) => <SelectItem value={item.id} key={item.id}>{item.id === "all" ? "All Files" : item.label}</SelectItem>)}</SelectContent></Select>}
      {showFiles && <Select value={fileSource} onValueChange={(value) => setFileSource(value as LibrarySourceFilter)}><SelectTrigger aria-label="File source"><SelectValue /></SelectTrigger><SelectContent>{LIBRARY_SOURCE_OPTIONS.map((item) => <SelectItem value={item.id} key={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>}
      {showProductions && <Button variant="outline" onClick={onNewProduction}><Plus /> New Production</Button>}
      {showProjects && <Button variant="outline" onClick={onNewProject}><Plus /> New Project</Button>}
      {showFiles && <Button variant="outline" onClick={onUploadFile}><Upload /> Upload File</Button>}
      <OperatorIconButton label="New Folder" detail="Folders organize Productions and Files without changing their technical identity." variant="outline" onClick={onNewFolder}><FolderPlus /></OperatorIconButton>
    </div>

    {workspaceOverview.folders.length > 0 && <section className="workspace-folder-strip" aria-labelledby="workspace-folders-title"><header><h2 id="workspace-folders-title">Folders</h2><span>{workspaceOverview.folders.length}</span></header><div><button type="button" aria-pressed={selectedFolderId === null} onClick={() => onSelectedFolderId(null)}><Folder /><span>All</span></button>{workspaceOverview.folders.map((folder) => <button type="button" aria-pressed={selectedFolderId === folder.id} onClick={() => onSelectedFolderId(folder.id)} key={folder.id}><Folder /><span>{folder.name}</span></button>)}</div></section>}

    <div className={cn("workspace-library-layout", (showProjects || showProductions !== showFiles) && "has-single-column")}>
      {showProjects && <section className="workspace-library-section" aria-labelledby="workspace-projects-title">
        <header><div><h2 id="workspace-projects-title">Projects</h2><p>Human initiatives that group related Productions.</p></div><span>{projects.length}</span></header>
        <div className="workspace-production-list">{projects.map((project) => <ProjectRow key={project.id} project={project} />)}
          {!projects.length && <div className="workspace-quiet-empty"><FolderKanban /><b>No Projects here yet</b><span>Create a Project to group Productions without changing them.</span></div>}
        </div>
      </section>}
      {showProductions && <section className="workspace-library-section" aria-labelledby="workspace-productions-title">
        <header><div><h2 id="workspace-productions-title">Productions</h2><p>Long-running creative work with its own editor.</p></div><span>{productions.length}</span></header>
        <div className="workspace-production-list">{productions.slice(0, view === "productions" ? undefined : 6).map((production) => <ProductionRow key={production.id} production={production} />)}
          {!productions.length && <div className="workspace-quiet-empty"><Clapperboard /><b>No Productions here yet</b><span>Create one without adding another container.</span></div>}
        </div>
      </section>}

      {showFiles && <section className="workspace-library-section" aria-labelledby="workspace-files-title">
        <header><div><h2 id="workspace-files-title">Files</h2><p>Reusable outputs and uploads, independent from Productions.</p></div><span>{files.length}</span></header>
        <div className="workspace-file-grid">{files.slice(0, view === "files" ? undefined : 8).map((file) => <FileTile key={file.id} file={file} />)}
          {!files.length && <div className="workspace-quiet-empty"><FileImage /><b>No Files here yet</b><span>Your generated and uploaded Files will appear here.</span></div>}
        </div>
      </section>}
    </div>

  </>
}

function FileUploadDialog({ open, onOpenChange, workspaceId, folderId, onUploaded }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: number
  folderId: number | null
  onUploaded: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [tagText, setTagText] = useState("")
  const [error, setError] = useState("")
  const action = useAsyncAction<"upload">()
  const uploading = action.isPending("upload")

  function reset() {
    setFile(null)
    setName("")
    setTagText("")
    setError("")
  }

  function chooseFile(next: File) {
    setFile(next)
    setName(next.name.replace(/\.[^.]+$/, ""))
    setError("")
  }

  async function upload() {
    if (!file || !name.trim()) return
    await action.run("upload", async () => {
      try {
        const tags = tagText.split(",").map((tag) => tag.trim()).filter(Boolean)
        await originsApi.uploadFileSummary(workspaceId, file, {
          name: name.trim(), tags, folderId,
        })
        toast.success("File added to this Workspace.")
        reset()
        onOpenChange(false)
        onUploaded()
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The File could not be uploaded.")
      }
    })
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!uploading) { if (!next) reset(); onOpenChange(next) } }}>
    <DialogContent className="workspace-file-upload-dialog">
      <DialogHeader><DialogTitle>Upload a File</DialogTitle><DialogDescription>Add one reusable File directly to this Workspace. Processing starts only when a format actually requires it.</DialogDescription></DialogHeader>
      <FileDropZone file={file} kind="file" accept="audio/*,image/*,video/*,.srt,.vtt,.txt,.md,.pdf,.json,.csv,.zip" hint="Audio, image, video, subtitles, text, PDF, JSON, CSV or ZIP · up to 1 GB" disabled={uploading} onFile={chooseFile} />
      {file && <div className="workspace-file-upload-fields"><label><span>Name</span><Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label><label><span>Tags <small>optional, separated by commas</small></span><Input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="reference, final, campaign" /></label></div>}
      {error && <p className="workspace-file-upload-error" role="alert">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={uploading} onClick={() => { reset(); onOpenChange(false) }}>Cancel</Button><ActionButton disabled={!file || !name.trim()} busy={uploading} busyLabel="Uploading…" onClick={() => void upload()}><Upload />Upload File</ActionButton></DialogFooter>
    </DialogContent>
  </Dialog>
}

function ResourceDialog({ kind, open, onOpenChange, workspaceId, folderId = null, onCreated }: {
  kind: "workspace" | "project" | "production" | "folder"
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: number | null
  folderId?: number | null
  onCreated: (createdWorkspaceId?: number) => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const action = useAsyncAction<"create">()
  const navigate = useNavigate()
  const creating = action.isPending("create")
  async function submit() {
    await action.run("create", async () => {
      try {
        if (kind === "workspace") {
          const workspace = await originsApi.createWorkspace(name.trim(), description.trim())
          onOpenChange(false); onCreated(workspace.id)
        } else if (kind === "project") {
          if (!workspaceId) throw new Error("Choose a Workspace before creating a Project.")
          const project = await originsApi.createProject(
            workspaceId, name.trim(), description.trim(), folderId)
          onOpenChange(false); onCreated()
          navigate(`/origins/projects/${project.public_id}`)
        } else if (kind === "production") {
          if (!workspaceId) throw new Error("Choose a Workspace before creating a Production.")
          const production = await originsApi.createAudiovisualProduction(
            workspaceId, name.trim(), description.trim(), folderId)
          onOpenChange(false); onCreated()
          navigate(`/origins/productions/audiovisual/${production.public_id}`)
        } else {
          if (!workspaceId) throw new Error("Choose a Workspace before creating a Folder.")
          await originsApi.createFolder(workspaceId, name.trim(), folderId)
          onOpenChange(false); onCreated()
          toast.success("Folder created.")
        }
        setName(""); setDescription("")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Unable to create this ${kind}.`)
      }
    })
  }
  const title = kind === "workspace" ? "New Workspace" : kind === "project" ? "New Project" : kind === "production" ? "New audiovisual Production" : "New Folder"
  const descriptionText = kind === "workspace" ? "A Workspace is the only ownership root." : kind === "project" ? "Group related Productions as one human initiative." : kind === "production" ? "Create a typed creative working environment." : "Place Projects, Productions and Files without changing what they are."
  const namePlaceholder = kind === "workspace" ? "Workspace name" : kind === "project" ? "Project name" : kind === "production" ? "Production name" : "Folder name"
  const createLabel = kind === "workspace" ? "Workspace" : kind === "project" ? "Project" : kind === "production" ? "Production" : "Folder"
  return <Dialog open={open} onOpenChange={(next) => { if (!creating) onOpenChange(next) }}><DialogContent className="workspace-resource-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{descriptionText}</DialogDescription></DialogHeader><form id={`workspace-${kind}-form`} onSubmit={(event) => { event.preventDefault(); if (name.trim()) void submit() }}><label><span>Name</span><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={namePlaceholder} /></label>{kind !== "folder" && <label><span>Description <small>optional</small></span><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={kind === "workspace" ? "What belongs in this Workspace?" : "What are you making?"} /></label>}</form><DialogFooter><Button type="button" variant="outline" disabled={creating} onClick={() => onOpenChange(false)}>Cancel</Button><ActionButton type="submit" form={`workspace-${kind}-form`} disabled={!name.trim()} busy={creating} busyLabel="Creating…">Create {createLabel}</ActionButton></DialogFooter></DialogContent></Dialog>
}

export function WorkspaceExplorerPage({ view = "create" }: { view?: WorkspaceExplorerView }) {
  const { workspaces, overview, actions, selectedWorkspaceId, setSelectedWorkspaceId, refresh, refreshWorkspaces, refreshActions } = useWorkspaceExplorer()
  const [dialog, setDialog] = useState<"workspace" | "project" | "production" | "folder" | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const availableWorkspaces = workspaces.data || []
  const workspaceOverview = overview.data
  const createActions = useMemo(() => actions.data || [], [actions.data])

  if (workspaces.status === "loading" && !availableWorkspaces.length) return <main className="workspace-explorer"><div className="workspace-explorer-loading"><Sparkles className="spin" /><span>Opening your Workspace…</span></div></main>
  if (workspaces.status === "error" && !availableWorkspaces.length) return <main className="workspace-explorer"><div className="workspace-explorer-loading"><b>Workspaces unavailable</b><span>{workspaces.error}</span><Button onClick={() => void refresh()}>Try again</Button></div></main>
  if (!selectedWorkspaceId || !availableWorkspaces.length) return <main className="workspace-explorer"><div className="workspace-explorer-loading"><b>Create your first Workspace</b><span>A Workspace is the only root container.</span><Button onClick={() => setDialog("workspace")}><Plus /> Create Workspace</Button></div>{dialog === "workspace" && <ResourceDialog kind="workspace" open onOpenChange={(open) => { if (!open) setDialog(null) }} workspaceId={null} onCreated={(workspaceId) => { if (workspaceId) { void refreshWorkspaces().then(() => setSelectedWorkspaceId(workspaceId)) } }} />}</main>
  if (!workspaceOverview && overview.status === "error") return <main className="workspace-explorer"><div className="workspace-explorer-loading"><b>Workspace unavailable</b><span>{overview.error}</span><Button onClick={() => void refresh()}>Try again</Button></div></main>

  return <main className="workspace-explorer">
    <header className="workspace-explorer-header"><div><select aria-label="Current Workspace" value={selectedWorkspaceId} onChange={(event) => { setSelectedFolderId(null); setSelectedWorkspaceId(Number(event.target.value)) }}>{availableWorkspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}</select><OperatorIconButton label="New Workspace" detail="Create another ownership root." size="icon-sm" variant="ghost" onClick={() => setDialog("workspace")}><Plus /></OperatorIconButton><span>{workspaceOverview?.workspace.description || "Your creative Workspace"}</span></div><small>{workspaceOverview ? `${workspaceOverview.projects.length} Projects · ${workspaceOverview.productions.length} Productions · ${workspaceOverview.files.length} Files` : "Loading…"}</small></header>
    {workspaceOverview ? <div className={cn("workspace-explorer-content", view !== "create" && "is-library-view")}>
      <ExplorerContent workspaceOverview={workspaceOverview} view={view} actions={createActions} actionsError={actions.status === "error" ? actions.error : undefined} onRetryActions={() => void refreshActions()} onNewProject={() => setDialog("project")} onNewProduction={() => setDialog("production")} onNewFolder={() => setDialog("folder")} onUploadFile={() => setUploadOpen(true)} selectedFolderId={selectedFolderId} onSelectedFolderId={setSelectedFolderId} />
    </div> : <div className="workspace-explorer-loading"><Sparkles className="spin" /><span>Loading Workspace…</span></div>}
    {dialog && <ResourceDialog kind={dialog} open onOpenChange={(open) => { if (!open) setDialog(null) }} workspaceId={selectedWorkspaceId} folderId={selectedFolderId} onCreated={(workspaceId) => { if (workspaceId) { setSelectedFolderId(null); void refreshWorkspaces().then(() => setSelectedWorkspaceId(workspaceId)) } else { void refresh() } }} />}
    <FileUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} workspaceId={selectedWorkspaceId} folderId={selectedFolderId} onUploaded={() => void refresh()} />
  </main>
}
