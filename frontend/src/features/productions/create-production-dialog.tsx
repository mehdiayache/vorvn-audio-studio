import { useEffect, useMemo, useState } from "react"
import { FolderKanban, Layers3 } from "lucide-react"

import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAsyncAction } from "@/hooks/use-async-action"
import { originsApi } from "@/lib/api"
import type { WorkspaceFolder, WorkspaceProduction, WorkspaceProject } from "@/types/domain"
import "./create-production-dialog.css"

const STANDALONE = "standalone"
const ROOT = "root"

function folderLabel(folder: WorkspaceFolder, folders: WorkspaceFolder[]): string {
  const names = [folder.name]
  let parentId = folder.parent_id
  const visited = new Set<number>([folder.id])
  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = folders.find((candidate) => candidate.id === parentId)
    if (!parent) break
    names.unshift(parent.name)
    parentId = parent.parent_id
  }
  return names.join(" / ")
}

export function CreateProductionDialog({
  open,
  onOpenChange,
  workspaceId,
  projects,
  folders,
  initialProjectId,
  initialFolderId = null,
  lockProject = false,
  onCreateProject,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: number
  projects: WorkspaceProject[]
  folders: WorkspaceFolder[]
  initialProjectId?: number | null
  initialFolderId?: number | null
  lockProject?: boolean
  onCreateProject?: () => void
  onCreated: (production: WorkspaceProduction) => void
}) {
  const preferredProjectId = initialProjectId === undefined
    ? projects[0]?.id ?? null
    : initialProjectId
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [projectValue, setProjectValue] = useState(
    preferredProjectId === null ? STANDALONE : String(preferredProjectId),
  )
  const [folderValue, setFolderValue] = useState(
    initialFolderId === null ? ROOT : String(initialFolderId),
  )
  const [error, setError] = useState("")
  const action = useAsyncAction<"create">()
  const creating = action.isPending("create")
  const projectId = projectValue === STANDALONE ? null : Number(projectValue)
  const selectedProject = projects.find((project) => project.id === projectId)
  const availableFolders = useMemo(() => folders.filter(
    (folder) => folder.project_id === projectId,
  ), [folders, projectId])

  useEffect(() => {
    if (!open) return
    setProjectValue(preferredProjectId === null
      ? STANDALONE
      : String(preferredProjectId))
    setFolderValue(initialFolderId === null ? ROOT : String(initialFolderId))
    setError("")
  }, [initialFolderId, open, preferredProjectId])

  function reset() {
    setName("")
    setDescription("")
    setError("")
  }

  async function submit() {
    if (!name.trim()) return
    await action.run("create", async () => {
      setError("")
      try {
        const production = await originsApi.createAudiovisualProduction(
          workspaceId,
          name.trim(),
          description.trim(),
          folderValue === ROOT ? null : Number(folderValue),
          projectId,
        )
        reset()
        onOpenChange(false)
        onCreated(production)
      } catch (reason) {
        setError(reason instanceof Error
          ? reason.message
          : "This Production could not be created.")
      }
    })
  }

  return <Dialog open={open} onOpenChange={(next) => {
    if (creating) return
    if (!next) reset()
    onOpenChange(next)
  }}>
    <DialogContent className="production-create-dialog">
      <DialogHeader>
        <DialogTitle>Create Audiovisual Production</DialogTitle>
        <DialogDescription>Create the working environment directly in its destination.</DialogDescription>
      </DialogHeader>
      <form id="production-create-form" onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}>
        <label><span>Name</span><Input autoFocus value={name} maxLength={180} onChange={(event) => setName(event.target.value)} placeholder="Hero Film" /></label>
        <label><span>Description <small>optional</small></span><Textarea value={description} maxLength={2_000} onChange={(event) => setDescription(event.target.value)} placeholder="What are you producing?" /></label>
        {lockProject && selectedProject
          ? <div className="production-create-destination"><FolderKanban /><span><small>Project</small><b>{selectedProject.name}</b></span></div>
          : <label><span>Project</span><Select value={projectValue} onValueChange={(value) => {
            setProjectValue(value)
            setFolderValue(ROOT)
          }}><SelectTrigger aria-label="Project"><SelectValue /></SelectTrigger><SelectContent>
            {projects.map((project) => <SelectItem value={String(project.id)} key={project.id}>{project.name}</SelectItem>)}
            <SelectItem value={STANDALONE}>Workspace / Standalone</SelectItem>
          </SelectContent></Select></label>}
        <label><span>Folder</span><Select value={folderValue} onValueChange={setFolderValue}><SelectTrigger aria-label="Folder"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value={ROOT}>{projectId === null ? "Workspace root" : "Project root"}</SelectItem>
          {availableFolders.map((folder) => <SelectItem value={String(folder.id)} key={folder.id}>{folderLabel(folder, availableFolders)}</SelectItem>)}
        </SelectContent></Select></label>
        {!projects.length && <div className="production-create-guidance"><Layers3 /><span><b>Projects keep related work together.</b><small>Create one first, or continue with a standalone Production.</small></span>{onCreateProject && <Button type="button" variant="outline" size="sm" onClick={onCreateProject}>Create Project</Button>}</div>}
        {error && <p className="production-create-error" role="alert">{error}</p>}
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={creating} onClick={() => onOpenChange(false)}>Cancel</Button>
        <ActionButton type="submit" form="production-create-form" disabled={!name.trim()} busy={creating} busyLabel="Creating…">Create Production</ActionButton>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
