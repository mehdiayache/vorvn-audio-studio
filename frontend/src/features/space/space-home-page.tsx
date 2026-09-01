import { useMemo, useState } from "react"
import {
  Captions, ChevronRight, Clapperboard, FileAudio2, FileImage, FileText,
  FileVideo2, Folder, FolderPlus, Image, Mic2, Music2, Plus, Search,
  Sparkles, Upload, Video, WandSparkles, Waves,
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
import { Textarea } from "@/components/ui/textarea"
import { useAsyncAction } from "@/hooks/use-async-action"
import { useSpaceHome } from "@/hooks/use-space-home"
import { studioApi } from "@/lib/api"
import { formatDuration, formatUpdated } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CreationActionSummary, SpaceFile, SpaceOverview, SpaceProject } from "@/types/domain"
import "./space-home.css"

export type SpaceHomeView = "create" | "projects" | "files"

const actionPresentation: Record<string, { icon: LucideIcon; href?: string; tone: string }> = {
  "generate-speech": { icon: Mic2, href: "/audio-studio/speak", tone: "speech" },
  "generate-music": { icon: Music2, href: "/audio-studio/create/generate-music", tone: "music" },
  "generate-sound-effect": { icon: Waves, href: "/audio-studio/create/generate-sound-effect", tone: "sound" },
  "generate-image": { icon: Image, tone: "image" },
  "generate-video": { icon: Video, tone: "video" },
  "create-subtitles": { icon: Captions, href: "/audio-studio/subtitles", tone: "subtitle" },
}

const fileIcons: Record<string, LucideIcon> = {
  audio: FileAudio2,
  image: FileImage,
  video: FileVideo2,
  subtitle: Captions,
  document: FileText,
}

function CreateActionButton({ action }: { action: CreationActionSummary }) {
  const presentation = actionPresentation[action.id] || { icon: Sparkles, tone: "other" }
  const Icon = presentation.icon
  const content = <><span className="space-create-action-icon"><Icon /></span><span><b>{action.label}</b><small>{action.description}</small></span><ChevronRight /></>
  if (presentation.href) {
    return <Button asChild variant="ghost" className={cn("space-create-action", `is-${presentation.tone}`)}><Link to={presentation.href}>{content}</Link></Button>
  }
  return <Button
    variant="ghost"
    className={cn("space-create-action", `is-${presentation.tone}`)}
    onClick={() => toast.info(`${action.label} is part of the new Create core.`, {
      description: "Its standalone Engine adapter is the next cutover step; no Project will be required.",
    })}
  >{content}</Button>
}

function ProjectRow({ project }: { project: SpaceProject }) {
  return <article className="space-project-row">
    <Link to={`/audio-studio/projects/audiovisual/${project.public_id}`} aria-label={`Open ${project.name}`} />
    <span className="space-project-icon"><Clapperboard /></span>
    <span className="space-project-copy"><b>{project.name}</b><small>Audiovisual Project</small></span>
    <span className="space-project-meta"><b>{formatUpdated(project.updated_at) || "Recently"}</b><small>{project.part_count} Part{project.part_count === 1 ? "" : "s"}</small></span>
    <ChevronRight />
  </article>
}

function FileTile({ file }: { file: SpaceFile }) {
  const version = file.current_version
  const FileIcon = fileIcons[version.family] || FileText
  const visual = version.family === "image"
    ? <img src={version.url} alt="" />
    : version.family === "video"
      ? <video src={version.url} muted preload="metadata" />
      : <span className="space-file-art"><FileIcon /></span>
  return <article className={cn("space-file-tile", `is-${version.family}`)}>
    <div className="space-file-preview">{visual}<span className="space-file-source">{file.source}</span></div>
    <div><b title={file.name}>{file.name}</b><small>{version.family}{version.duration_ms ? ` · ${formatDuration(version.duration_ms / 1000)}` : ""}</small></div>
  </article>
}

function SpaceContent({ spaceOverview, view, actions, actionsError, onRetryActions, onNewProject, onNewFolder, onUploadFile }: {
  spaceOverview: SpaceOverview
  view: SpaceHomeView
  actions: CreationActionSummary[]
  actionsError?: string
  onRetryActions: () => void
  onNewProject: () => void
  onNewFolder: () => void
  onUploadFile: () => void
}) {
  const [query, setQuery] = useState("")
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const normalizedQuery = query.trim().toLowerCase()
  const projects = spaceOverview.projects.filter((project) =>
    (selectedFolderId === null || project.folder_id === selectedFolderId)
    && (!normalizedQuery || project.name.toLowerCase().includes(normalizedQuery)))
  const files = spaceOverview.files.filter((file) =>
    (selectedFolderId === null || file.folder_id === selectedFolderId)
    && (!normalizedQuery || `${file.name} ${file.source} ${file.tags.join(" ")}`.toLowerCase().includes(normalizedQuery)))
  const showProjects = view !== "files"
  const showFiles = view !== "projects"

  return <>
    {view === "create" && <section className="space-create-stage" aria-labelledby="space-create-title">
      <span className="space-create-kicker"><WandSparkles /> Create</span>
      <h1 id="space-create-title">What do you want to create?</h1>
      <p>Start with an idea or open an audiovisual Project. Files stay reusable across this Space.</p>
      <div className="space-create-action-catalog" role="list">
        <Button className="space-create-action is-project" variant="ghost" onClick={onNewProject}><span className="space-create-action-icon"><Clapperboard /></span><span><b>New audiovisual project</b><small>Script, Timeline, Preview and Director in one Project.</small></span><ChevronRight /></Button>
        <Button className="space-create-action is-upload" variant="ghost" onClick={onUploadFile}><span className="space-create-action-icon"><Upload /></span><span><b>Upload a File</b><small>Add an existing file directly to this Space.</small></span><ChevronRight /></Button>
        {actions.map((action) => <CreateActionButton action={action} key={action.id} />)}
      </div>
      {actionsError && <div className="space-create-inline-error" role="alert"><span>{actionsError}</span><Button variant="ghost" size="sm" onClick={onRetryActions}>Try again</Button></div>}
    </section>}

    <div className="space-library-toolbar">
      <label><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${view === "projects" ? "Projects" : view === "files" ? "Files" : "this Space"}`} /></label>
      {showProjects && <Button variant="outline" onClick={onNewProject}><Plus /> New Project</Button>}
      {showFiles && <Button variant="outline" onClick={onUploadFile}><Upload /> Upload File</Button>}
      <OperatorIconButton label="New Folder" detail="Folders organize Projects and Files without changing their technical identity." variant="outline" onClick={onNewFolder}><FolderPlus /></OperatorIconButton>
    </div>

    {spaceOverview.folders.length > 0 && <section className="space-folder-strip" aria-labelledby="space-folders-title"><header><h2 id="space-folders-title">Folders</h2><span>{spaceOverview.folders.length}</span></header><div><button type="button" aria-pressed={selectedFolderId === null} onClick={() => setSelectedFolderId(null)}><Folder /><span>All</span></button>{spaceOverview.folders.map((folder) => <button type="button" aria-pressed={selectedFolderId === folder.id} onClick={() => setSelectedFolderId(folder.id)} key={folder.id}><Folder /><span>{folder.name}</span></button>)}</div></section>}

    <div className={cn("space-library-layout", showProjects !== showFiles && "has-single-column")}>
      {showProjects && <section className="space-library-section" aria-labelledby="space-projects-title">
        <header><div><h2 id="space-projects-title">Projects</h2><p>Long-running creative work with its own editor.</p></div><span>{projects.length}</span></header>
        <div className="space-project-list">{projects.slice(0, view === "projects" ? undefined : 6).map((project) => <ProjectRow key={project.id} project={project} />)}
          {!projects.length && <div className="space-quiet-empty"><Clapperboard /><b>No Projects here yet</b><span>Create one without adding another container.</span></div>}
        </div>
      </section>}

      {showFiles && <section className="space-library-section" aria-labelledby="space-files-title">
        <header><div><h2 id="space-files-title">Files</h2><p>Reusable outputs and uploads, independent from Projects.</p></div><span>{files.length}</span></header>
        <div className="space-file-grid">{files.slice(0, view === "files" ? undefined : 8).map((file) => <FileTile key={file.id} file={file} />)}
          {!files.length && <div className="space-quiet-empty"><FileImage /><b>No Files here yet</b><span>Your generated and uploaded Files will appear here.</span></div>}
        </div>
      </section>}
    </div>

  </>
}

function FileUploadDialog({ open, onOpenChange, spaceId, onUploaded }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: number
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
        await studioApi.uploadSpaceFile(spaceId, file, { name: name.trim(), tags })
        toast.success("File added to this Space.")
        reset()
        onOpenChange(false)
        onUploaded()
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The File could not be uploaded.")
      }
    })
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!uploading) { if (!next) reset(); onOpenChange(next) } }}>
    <DialogContent className="space-file-upload-dialog">
      <DialogHeader><DialogTitle>Upload a File</DialogTitle><DialogDescription>Add one reusable File directly to this Space. Processing starts only when a format actually requires it.</DialogDescription></DialogHeader>
      <FileDropZone file={file} kind="file" accept="audio/*,image/*,video/*,.srt,.vtt,.txt,.md,.pdf,.json,.csv,.zip" hint="Audio, image, video, subtitles, text, PDF, JSON, CSV or ZIP · up to 1 GB" disabled={uploading} onFile={chooseFile} />
      {file && <div className="space-file-upload-fields"><label><span>Name</span><Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label><label><span>Tags <small>optional, separated by commas</small></span><Input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="reference, final, campaign" /></label></div>}
      {error && <p className="space-file-upload-error" role="alert">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={uploading} onClick={() => { reset(); onOpenChange(false) }}>Cancel</Button><ActionButton disabled={!file || !name.trim()} busy={uploading} busyLabel="Uploading…" onClick={() => void upload()}><Upload />Upload File</ActionButton></DialogFooter>
    </DialogContent>
  </Dialog>
}

function ResourceDialog({ kind, open, onOpenChange, spaceId, onCreated }: {
  kind: "space" | "project" | "folder"
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: number | null
  onCreated: (createdSpaceId?: number) => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const action = useAsyncAction<"create">()
  const navigate = useNavigate()
  const creating = action.isPending("create")
  async function submit() {
    await action.run("create", async () => {
      try {
        if (kind === "space") {
          const space = await studioApi.createSpace(name.trim(), description.trim())
          onOpenChange(false); onCreated(space.id)
        } else if (kind === "project") {
          if (!spaceId) throw new Error("Choose a Space before creating a Project.")
          const project = await studioApi.createAudiovisualProject(spaceId, name.trim(), description.trim())
          onOpenChange(false); onCreated()
          navigate(`/audio-studio/projects/audiovisual/${project.public_id}`)
        } else {
          if (!spaceId) throw new Error("Choose a Space before creating a Folder.")
          await studioApi.createFolder(spaceId, name.trim())
          onOpenChange(false); onCreated()
          toast.success("Folder created.")
        }
        setName(""); setDescription("")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Unable to create this ${kind}.`)
      }
    })
  }
  const title = kind === "space" ? "New Space" : kind === "project" ? "New audiovisual Project" : "New Folder"
  const descriptionText = kind === "space" ? "A Space is the only root for reusable Files and Projects." : kind === "project" ? "Create the Project directly in this Space. No intermediate Venture or Series." : "Organize Projects and Files without changing what they are."
  const namePlaceholder = kind === "space" ? "Space name" : kind === "project" ? "Project name" : "Folder name"
  const createLabel = kind === "space" ? "Space" : kind === "project" ? "Project" : "Folder"
  return <Dialog open={open} onOpenChange={(next) => { if (!creating) onOpenChange(next) }}><DialogContent className="space-resource-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{descriptionText}</DialogDescription></DialogHeader><form id={`space-${kind}-form`} onSubmit={(event) => { event.preventDefault(); if (name.trim()) void submit() }}><label><span>Name</span><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={namePlaceholder} /></label>{kind !== "folder" && <label><span>Description <small>optional</small></span><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={kind === "space" ? "What belongs in this Space?" : "What are you making?"} /></label>}</form><DialogFooter><Button type="button" variant="outline" disabled={creating} onClick={() => onOpenChange(false)}>Cancel</Button><ActionButton type="submit" form={`space-${kind}-form`} disabled={!name.trim()} busy={creating} busyLabel="Creating…">Create {createLabel}</ActionButton></DialogFooter></DialogContent></Dialog>
}

export function SpaceHomePage({ view = "create" }: { view?: SpaceHomeView }) {
  const { spaces, overview, actions, selectedSpaceId, setSelectedSpaceId, refresh, refreshSpaces, refreshActions } = useSpaceHome()
  const [dialog, setDialog] = useState<"space" | "project" | "folder" | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const availableSpaces = spaces.data || []
  const spaceOverview = overview.data
  const createActions = useMemo(() => actions.data || [], [actions.data])

  if (spaces.status === "loading" && !availableSpaces.length) return <main className="space-home"><div className="space-home-loading"><Sparkles className="spin" /><span>Opening your Space…</span></div></main>
  if (spaces.status === "error" && !availableSpaces.length) return <main className="space-home"><div className="space-home-loading"><b>Spaces unavailable</b><span>{spaces.error}</span><Button onClick={() => void refresh()}>Try again</Button></div></main>
  if (!selectedSpaceId || !availableSpaces.length) return <main className="space-home"><div className="space-home-loading"><b>Create your first Space</b><span>A Space is the only root container.</span><Button onClick={() => setDialog("space")}><Plus /> Create Space</Button></div>{dialog === "space" && <ResourceDialog kind="space" open onOpenChange={(open) => { if (!open) setDialog(null) }} spaceId={null} onCreated={(spaceId) => { if (spaceId) { void refreshSpaces().then(() => setSelectedSpaceId(spaceId)) } }} />}</main>
  if (!spaceOverview && overview.status === "error") return <main className="space-home"><div className="space-home-loading"><b>Space unavailable</b><span>{overview.error}</span><Button onClick={() => void refresh()}>Try again</Button></div></main>

  return <main className="space-home">
    <header className="space-home-header"><div><select aria-label="Current Space" value={selectedSpaceId} onChange={(event) => setSelectedSpaceId(Number(event.target.value))}>{availableSpaces.map((space) => <option value={space.id} key={space.id}>{space.name}</option>)}</select><OperatorIconButton label="New Space" detail="Create another root for independent Projects and Files." size="icon-sm" variant="ghost" onClick={() => setDialog("space")}><Plus /></OperatorIconButton><span>{spaceOverview?.space.description || "Your creative Space"}</span></div><small>{spaceOverview ? `${spaceOverview.projects.length} Projects · ${spaceOverview.files.length} Files` : "Loading…"}</small></header>
    {spaceOverview ? <div className={cn("space-home-content", view !== "create" && "is-library-view")}>
      <SpaceContent spaceOverview={spaceOverview} view={view} actions={createActions} actionsError={actions.status === "error" ? actions.error : undefined} onRetryActions={() => void refreshActions()} onNewProject={() => setDialog("project")} onNewFolder={() => setDialog("folder")} onUploadFile={() => setUploadOpen(true)} />
    </div> : <div className="space-home-loading"><Sparkles className="spin" /><span>Loading Space…</span></div>}
    {dialog && <ResourceDialog kind={dialog} open onOpenChange={(open) => { if (!open) setDialog(null) }} spaceId={selectedSpaceId} onCreated={(spaceId) => { if (spaceId) { void refreshSpaces().then(() => setSelectedSpaceId(spaceId)) } else { void refresh() } }} />}
    <FileUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} spaceId={selectedSpaceId} onUploaded={() => void refresh()} />
  </main>
}
