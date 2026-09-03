import { AlertTriangle, Captions, EyeOff, FileText, FolderOpen, Images, Plus, Search, Upload, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"

import { AudioFileCard } from "@/components/audio-file-card"
import { OperatorIconButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { CreatorLibraryCreationItem } from "@/features/creator/library/creator-library-creation-item"
import {
  createLibraryQuery, LIBRARY_SCOPE_OPTIONS, LIBRARY_SOURCE_OPTIONS, LIBRARY_TYPE_OPTIONS,
  LIBRARY_USAGE_OPTIONS, libraryFileEntry, libraryFileName, libraryFileType, queryLibraryEntries,
  type LibraryEntry, type LibraryScope, type LibrarySourceFilter, type LibraryTypeFilter, type LibraryUsageFilter,
} from "@/features/library/library-query"
import type { WorkspaceFile, WorkspaceFolder } from "@/types/domain"
import { ProjectLibraryUploadCard, type ProjectLibraryUploadItem } from "./project-library-upload-card"
import { VisualFileCard } from "./visual-file-card"

function galleryColumnCount(width: number) {
  if (width < 400) return 1
  if (width < 580) return 2
  if (width < 740) return 3
  if (width < 880) return 4
  return 5
}

function uploadType(item: ProjectLibraryUploadItem): LibraryEntry["type"] {
  if (item.file.type.startsWith("image/")) return "image"
  if (item.file.type.startsWith("video/")) return "video"
  if (item.file.type.startsWith("audio/")) return "audio"
  if (/\.(srt|vtt)$/i.test(item.file.name)) return "subtitle"
  if (/\.(json|csv|zip)$/i.test(item.file.name)) return "data"
  return "document"
}

type ProjectLibraryEntry =
  | { kind: "generation"; item: CreatorLibraryCreationItem; order: number; libraryEntry: LibraryEntry }
  | { kind: "upload"; item: ProjectLibraryUploadItem; order: number; libraryEntry: LibraryEntry }
  | { kind: "file"; file: WorkspaceFile; order: number; libraryEntry: LibraryEntry }

export function ProjectLibraryGallery({
  folders = [], files, projectFileIds = [], libraryFileIds = [], currentFolderId,
  uploads, creationItems = [], usageCounts, pendingId, onPreview, onAddToProject,
  onAddToTimeline, onRemove, onRetryUpload, onDismissUpload, onUpload,
  playingFileId, onPlayAudio,
}: {
  folders?: WorkspaceFolder[]
  files: WorkspaceFile[]
  projectFileIds?: number[]
  libraryFileIds?: number[]
  currentFolderId?: number | null
  uploads: ProjectLibraryUploadItem[]
  creationItems?: CreatorLibraryCreationItem[]
  usageCounts?: ReadonlyMap<number, number>
  pendingId: number | null
  onPreview: (file: WorkspaceFile) => void
  onAddToProject: (file: WorkspaceFile) => void
  onAddToTimeline?: (file: WorkspaceFile) => void
  onRemove: (file: WorkspaceFile) => void
  onRetryUpload: (item: ProjectLibraryUploadItem) => void
  onDismissUpload: (item: ProjectLibraryUploadItem) => void
  onUpload: () => void
  playingFileId?: number | null
  onPlayAudio?: (file: WorkspaceFile) => void
}) {
  const [scope, setScope] = useState<LibraryScope>("project")
  const [type, setType] = useState<LibraryTypeFilter>("all")
  const [source, setSource] = useState<LibrarySourceFilter>("all")
  const [usage, setUsage] = useState<LibraryUsageFilter>("any")
  const [search, setSearch] = useState("")
  const [folder, setFolder] = useState("all")
  const [showFailed, setShowFailed] = useState(false)
  const [columnCount, setColumnCount] = useState(5)
  const galleryRef = useRef<HTMLDivElement>(null)
  const projectIds = useMemo(() => new Set(projectFileIds), [projectFileIds])
  const collectedIds = useMemo(() => new Set(libraryFileIds), [libraryFileIds])
  const usedIds = useMemo(() => new Set(usageCounts?.keys() || []), [usageCounts])
  const query = useMemo(() => createLibraryQuery({
    scope, type, source, usage, search,
    folder: folder as "all" | "root" | `${number}`,
  }), [folder, scope, search, source, type, usage])
  const queryContext = useMemo(() => ({ projectFileIds: projectIds, usedFileIds: usedIds, currentFolderId }), [currentFolderId, projectIds, usedIds])
  const failedCount = creationItems.filter(({ status }) => status === "failed" || status === "canceled").length
  const items = useMemo(() => {
    const candidates: ProjectLibraryEntry[] = [
      ...creationItems.map((item, order) => ({
        kind: "generation" as const,
        item,
        order,
        libraryEntry: {
          type: item.mediaType || "other",
          source: "generated" as const,
          folderId: item.folderId ?? null,
          searchText: (item.searchText || item.mediaType || "generation").toLocaleLowerCase(),
          createdAt: item.createdAt,
          projectAssociated: item.projectAssociated ?? true,
          pending: true,
        } satisfies LibraryEntry,
      })),
      ...uploads.map((item, order) => ({
        kind: "upload" as const,
        item,
        order: creationItems.length + order,
        libraryEntry: {
          type: uploadType(item),
          source: "uploaded" as const,
          folderId: currentFolderId ?? null,
          searchText: item.file.name.toLocaleLowerCase(),
          createdAt: null,
          projectAssociated: true,
          pending: true,
        } satisfies LibraryEntry,
      })),
      ...files.map((file, order) => ({
        kind: "file" as const,
        file,
        order: creationItems.length + uploads.length + order,
        libraryEntry: libraryFileEntry(file, queryContext),
      })),
    ]
    return queryLibraryEntries(candidates.filter((entry) => entry.kind !== "generation" || showFailed || (entry.item.status !== "failed" && entry.item.status !== "canceled")), query, queryContext)
  }, [creationItems, currentFolderId, files, query, queryContext, showFailed, uploads])

  useEffect(() => {
    const element = galleryRef.current
    if (!element) return
    const update = (width: number) => { if (width > 0) setColumnCount(galleryColumnCount(width)) }
    update(element.getBoundingClientRect().width)
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver((entries) => { const entry = entries[0]; if (entry) update(entry.contentRect.width) })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  if (!creationItems.length && !uploads.length && !files.length) return <section className="project-library-empty" aria-label="Project Library is empty">
    <span><Images aria-hidden="true" /></span>
    <h2>No Files yet</h2>
    <p>Upload a File or create one. Every result remains reusable across this Workspace.</p>
    <div><Button onClick={onUpload}>Upload File</Button></div>
  </section>

  function renderEntry(entry: (typeof items)[number]) {
    if (entry.kind === "generation") return <div className="project-library-generation-gallery-entry" key={`generation-${entry.item.id}`}>{entry.item.node}</div>
    if (entry.kind === "upload") return <ProjectLibraryUploadCard key={entry.item.id} item={entry.item} onRetry={onRetryUpload} onDismiss={onDismissUpload} />
    const file = entry.file
    const kind = libraryFileType(file)
    const associated = projectIds.has(file.id)
    const removable = collectedIds.has(file.id)
    if (kind === "image" || kind === "video") return <VisualFileCard
      key={file.id} file={file} usedCount={usageCounts?.get(file.id) || 0} pending={pendingId === file.id}
      onPreview={onPreview} onAddToProject={!associated ? onAddToProject : undefined}
      onAddToTimeline={onAddToTimeline} onRemove={removable ? onRemove : undefined}
    />
    const projectAction = !associated
      ? <OperatorIconButton label={`Add ${libraryFileName(file)} to this Project`} detail="Associates this Workspace File with the current Project." onClick={() => onAddToProject(file)}><Plus /></OperatorIconButton>
      : removable
        ? <OperatorIconButton label={`Remove ${libraryFileName(file)} from Project`} detail="The File remains available in the Workspace Library." onClick={() => onRemove(file)}><X /></OperatorIconButton>
        : null
    if (kind === "audio" || kind === "speech" || kind === "music" || kind === "sfx") return <div className="project-library-audio-entry" key={file.id}><AudioFileCard file={file} used={Boolean(usageCounts?.get(file.id))} playing={playingFileId === file.id} onPlay={onPlayAudio ? () => onPlayAudio(file) : undefined} />{projectAction}</div>
    return <article className="project-library-generic-file" key={file.id}><span>{kind === "subtitle" ? <Captions /> : <FileText />}</span><div><b>{libraryFileName(file)}</b><small>{kind === "subtitle" ? "Subtitle" : kind === "document" ? "Document" : kind === "data" ? "Data" : "File"}</small></div>{projectAction}</article>
  }

  return <section className="project-library-gallery" aria-label="Project Library files">
    <header>
      <div className="project-library-primary-tools">
        <label className="project-library-search"><Search aria-hidden="true" /><Input aria-label="Search Library" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search names or tags" /></label>
        <Select value={scope} onValueChange={(next) => { setScope(next as LibraryScope); if (next === "folder") setFolder("all") }}><SelectTrigger aria-label="Library scope"><SelectValue /></SelectTrigger><SelectContent>{LIBRARY_SCOPE_OPTIONS.filter(({ id }) => id !== "folder" || currentFolderId !== undefined).map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>
        {folders.length > 0 && scope !== "folder" && <Select value={folder} onValueChange={setFolder}><SelectTrigger aria-label="Library folder"><FolderOpen /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All folders</SelectItem><SelectItem value="root">Workspace root</SelectItem>{folders.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select>}
        <Select value={usage} onValueChange={(next) => setUsage(next as LibraryUsageFilter)}><SelectTrigger aria-label="Project usage"><SelectValue /></SelectTrigger><SelectContent>{LIBRARY_USAGE_OPTIONS.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" size="sm" onClick={onUpload}><Upload />Upload</Button>
      </div>
      <div className="project-library-gallery-filters">
        <ToggleGroup type="single" variant="outline" size="sm" value={type} onValueChange={(next) => { if (next) setType(next as LibraryTypeFilter) }} aria-label="File type">
          {LIBRARY_TYPE_OPTIONS.map((item) => <ToggleGroupItem key={item.id} value={item.id}>{item.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" size="sm" value={source} onValueChange={(next) => { if (next) setSource(next as LibrarySourceFilter) }} aria-label="File source">
          {LIBRARY_SOURCE_OPTIONS.map((item) => <ToggleGroupItem key={item.id} value={item.id}>{item.label}</ToggleGroupItem>)}
        </ToggleGroup>
        {failedCount > 0 && <Button type="button" variant={showFailed ? "secondary" : "outline"} size="sm" aria-pressed={showFailed} onClick={() => setShowFailed((current) => !current)}>{showFailed ? <EyeOff /> : <AlertTriangle />}{showFailed ? "Hide failed" : "Show failed"} <span>{failedCount}</span></Button>}
      </div>
    </header>
    {!items.length && <div className="project-library-filter-empty"><Images /><p>No Files match this Library scope or these filters.</p><Button variant="outline" size="sm" onClick={() => { setSearch(""); setFolder("all"); setType("all"); setSource("all"); setUsage("any"); setShowFailed(false) }}>Clear filters</Button></div>}
    <div ref={galleryRef} className={`project-library-gallery-items${items.length <= columnCount ? " is-single-row" : ""}`} style={{ "--project-library-gallery-columns": columnCount } as CSSProperties}>
      {items.map(renderEntry)}
    </div>
  </section>
}
