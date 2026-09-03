import { Captions, FileText, FolderOpen, Images, Plus, Search, SlidersHorizontal } from "lucide-react"
import { useMemo, useState } from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { AudioFileCard } from "@/components/audio-file-card"
import {
  createLibraryQuery, LIBRARY_SCOPE_OPTIONS, LIBRARY_SORT_OPTIONS, LIBRARY_SOURCE_OPTIONS,
  LIBRARY_TYPE_OPTIONS, LIBRARY_USAGE_OPTIONS, libraryFileType, queryLibraryFiles,
  type LibraryScope, type LibrarySort, type LibrarySourceFilter, type LibraryTypeFilter, type LibraryUsageFilter,
} from "@/features/library/library-query"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { WorkspaceFile, WorkspaceFolder } from "@/types/domain"
import { isVisualFile, visualFileName } from "@/features/creator/library/visual-file-presentation"
import { VisualFileCard } from "./visual-file-card"

export function ProjectLibraryDialog({ open, folders = [], files, projectFileIds = [], usedFileIds = [], currentFolderId, pendingId, initialScope = "workspace", showScope = true, title = "Workspace Library", description = "Choose reusable Files for this Project.", emptyDescription = "Upload a File to the Workspace Library first.", addLabel = "Add", onOpenChange, onPreview, onAdd }: {
  open: boolean
  folders?: WorkspaceFolder[]
  files: WorkspaceFile[]
  projectFileIds?: number[]
  usedFileIds?: number[]
  currentFolderId?: number | null
  pendingId: number | null
  initialScope?: LibraryScope
  showScope?: boolean
  title?: string
  description?: string
  emptyDescription?: string
  addLabel?: string
  onOpenChange: (open: boolean) => void
  onPreview: (file: WorkspaceFile) => void
  onAdd: (file: WorkspaceFile) => void
}) {
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<LibraryScope>(initialScope)
  const [source, setSource] = useState<LibrarySourceFilter>("all")
  const [folderId, setFolderId] = useState("all")
  const [mediaType, setMediaType] = useState<LibraryTypeFilter>("all")
  const [usage, setUsage] = useState<LibraryUsageFilter>("any")
  const [sort, setSort] = useState<LibrarySort>("recent")
  const projectIds = useMemo(() => new Set(projectFileIds), [projectFileIds])
  const usedIds = useMemo(() => new Set(usedFileIds), [usedFileIds])
  const usageCounts = useMemo(() => new Map(usedFileIds.map((id) => [id, 1])), [usedFileIds])
  const libraryQuery = useMemo(() => createLibraryQuery({ scope, type: mediaType, source, folder: folderId as "all" | "root" | `${number}`, search: query, usage, sort }), [folderId, mediaType, query, scope, sort, source, usage])
  const visible = useMemo(() => queryLibraryFiles(files, libraryQuery, { projectFileIds: projectIds, usedFileIds: usedIds, currentFolderId }), [currentFolderId, files, libraryQuery, projectIds, usedIds])
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="project-library-dialog">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <div className="project-library-dialog-toolbar">
        <label className="project-library-dialog-search"><Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names or tags" /></label>
        {folders.length > 0 && scope !== "folder" && <Select value={folderId} onValueChange={setFolderId}><SelectTrigger aria-label="Library folder"><FolderOpen /><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All folders</SelectItem><SelectItem value="root">Workspace root</SelectItem>{folders.map((folder) => <SelectItem key={folder.id} value={String(folder.id)}>{folder.name}</SelectItem>)}</SelectGroup></SelectContent></Select>}
        {showScope && <Select value={scope} onValueChange={(value) => { setScope(value as LibraryScope); if (value === "folder") setFolderId("all") }}><SelectTrigger aria-label="Library scope"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{LIBRARY_SCOPE_OPTIONS.filter(({ id }) => id !== "folder" || currentFolderId !== undefined).map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>}
        <Select value={source} onValueChange={(value) => setSource(value as LibrarySourceFilter)}><SelectTrigger aria-label="File source"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{LIBRARY_SOURCE_OPTIONS.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
        <Select value={mediaType} onValueChange={(value) => setMediaType(value as LibraryTypeFilter)}><SelectTrigger aria-label="File type"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{LIBRARY_TYPE_OPTIONS.map((item) => <SelectItem key={item.id} value={item.id}>{item.id === "all" ? "All Files" : item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
        <Select value={usage} onValueChange={(value) => setUsage(value as LibraryUsageFilter)}><SelectTrigger aria-label="Project usage"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{LIBRARY_USAGE_OPTIONS.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
        <Select value={sort} onValueChange={(value) => setSort(value as LibrarySort)}><SelectTrigger aria-label="Sort Files"><SlidersHorizontal /><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{LIBRARY_SORT_OPTIONS.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
      </div>
      {visible.length
        ? <div className="project-library-dialog-grid">{visible.map((file) => {
          if (isVisualFile(file)) return <VisualFileCard key={file.id} file={file} mode="workspace-library" usedCount={usageCounts.get(file.id) || 0} pending={pendingId === file.id} addLabel={addLabel} onPreview={onPreview} onAdd={onAdd} />
          const kind = libraryFileType(file)
          if (kind === "audio" || kind === "speech" || kind === "music" || kind === "sfx") return <article className="project-library-dialog-file" key={file.id}><AudioFileCard file={file} used={Boolean(usageCounts.get(file.id))} /><Button disabled={pendingId === file.id} size="sm" onClick={() => onAdd(file)}><Plus />{pendingId === file.id ? "Adding…" : addLabel}</Button></article>
          return <article className="project-library-dialog-file is-generic" key={file.id}><span>{kind === "subtitle" ? <Captions /> : <FileText />}</span><div><b>{visualFileName(file)}</b><small>{kind === "subtitle" ? "Subtitle" : "File"}</small></div><Button disabled={pendingId === file.id} size="sm" onClick={() => onAdd(file)}><Plus />{pendingId === file.id ? "Adding…" : addLabel}</Button></article>
        })}</div>
        : <div className="project-library-dialog-empty"><Images /><h3>{files.length ? "No matching Files" : "No Files available"}</h3><p>{files.length ? "Try a different name or filter." : emptyDescription}</p></div>}
    </DialogContent>
  </Dialog>
}
