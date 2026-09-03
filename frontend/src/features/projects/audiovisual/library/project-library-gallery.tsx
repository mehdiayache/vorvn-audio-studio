import { AlertTriangle, Captions, EyeOff, FileText, FolderOpen, Images, Search, Upload, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AudioFileCard } from "@/components/audio-file-card"
import { OperatorIconButton } from "@/components/operator-action"
import { creatorLibraryKind, type CreatorLibraryKind } from "@/features/creator/library/creator-library-browser"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FILE_SOURCE_PRESENTATION, fileSource, type FileSource } from "@/lib/file-provenance"
import type { WorkspaceFile, WorkspaceFolder } from "@/types/domain"
import type { CreatorLibraryCreationItem } from "@/features/creator/library/creator-library-creation-item"
import { ProjectLibraryUploadCard, type ProjectLibraryUploadItem } from "./project-library-upload-card"
import { VisualFileCard } from "./visual-file-card"

function galleryColumnCount(width: number) {
  if (width < 400) return 1
  if (width < 580) return 2
  if (width < 740) return 3
  if (width < 880) return 4
  return 5
}

export function ProjectLibraryGallery({ folders = [], files, uploads, creationItems = [], usageCounts, pendingId, onPreview, onAddToTimeline, onRemove, onRetryUpload, onDismissUpload, onUpload, onOpenLibrary, playingFileId, onPlayAudio }: {
  folders?: WorkspaceFolder[]
  files: WorkspaceFile[]
  uploads: ProjectLibraryUploadItem[]
  creationItems?: CreatorLibraryCreationItem[]
  usageCounts?: ReadonlyMap<number, number>
  pendingId: number | null
  onPreview: (file: WorkspaceFile) => void
  onAddToTimeline?: (file: WorkspaceFile) => void
  onRemove: (file: WorkspaceFile) => void
  onRetryUpload: (item: ProjectLibraryUploadItem) => void
  onDismissUpload: (item: ProjectLibraryUploadItem) => void
  onUpload: () => void
  onOpenLibrary: () => void
  playingFileId?: number | null
  onPlayAudio?: (file: WorkspaceFile) => void
}) {
  const [mediaFilter, setMediaFilter] = useState<CreatorLibraryKind>("all")
  const [originFilter, setOriginFilter] = useState<"all" | FileSource>("all")
  const [query, setQuery] = useState("")
  const [folderId, setFolderId] = useState("all")
  const [showFailed, setShowFailed] = useState(false)
  const [columnCount, setColumnCount] = useState(5)
  const galleryRef = useRef<HTMLDivElement>(null)
  const failedCount = creationItems.filter(({ status }) => status === "failed" || status === "canceled").length
  const items = useMemo(() => {
    const candidates = [
      ...creationItems.map(({ id, node, status, mediaType, createdAt }, order) => ({ kind: "generation" as const, origin: "generated" as const, id, node, status, mediaType, createdAt, order })),
      ...uploads.map((item, order) => ({ kind: "upload" as const, origin: "uploaded" as const, item, mediaType: item.file.type.startsWith("video/") ? "video" as const : "image" as const, createdAt: null, order: creationItems.length + order })),
      ...files.map((file, order) => ({ kind: "file" as const, origin: fileSource(file), file, mediaType: creatorLibraryKind(file), createdAt: file.created_at || file.updated_at || null, order: creationItems.length + uploads.length + order })),
    ]
    return candidates
      .filter((entry) => entry.kind !== "generation" || showFailed || (entry.status !== "failed" && entry.status !== "canceled"))
      .filter((entry) => {
        if (!query.trim() || entry.kind !== "file") return true
        const haystack = `${entry.file.name || ""} ${entry.file.title || ""} ${entry.file.filename || ""} ${(entry.file.tags || []).join(" ")}`.toLowerCase()
        return haystack.includes(query.trim().toLowerCase())
      })
      .filter((entry) => mediaFilter === "all" || entry.mediaType === mediaFilter)
      .filter((entry) => folderId === "all" || entry.kind === "file" && (folderId === "root" ? !entry.file.folder_id : String(entry.file.folder_id) === folderId))
      .filter((entry) => originFilter === "all" || entry.origin === originFilter)
      .sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : Number.NaN
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : Number.NaN
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return rightTime - leftTime
        return left.order - right.order
      })
  }, [files, creationItems, folderId, mediaFilter, originFilter, query, showFailed, uploads])

  useEffect(() => {
    const element = galleryRef.current
    if (!element) return
    const update = (width: number) => {
      if (width > 0) setColumnCount(galleryColumnCount(width))
    }
    update(element.getBoundingClientRect().width)
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) update(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  if (!creationItems.length && !uploads.length && !files.length) return <section className="project-library-empty" aria-label="Project Library is empty">
    <span><Images aria-hidden="true" /></span>
    <h2>No media collected yet</h2>
    <p>Upload media or choose from the Workspace Library. This Project Library keeps material close without placing it on Timeline.</p>
    <div><Button onClick={onUpload}>Upload media</Button><Button variant="outline" onClick={onOpenLibrary}>Open Workspace Library</Button></div>
  </section>

  function renderEntry(entry: (typeof items)[number]) {
    if (entry.kind === "generation") return <div className="project-library-generation-gallery-entry" key={`generation-${entry.id}`}>{entry.node}</div>
    if (entry.kind === "upload") return <ProjectLibraryUploadCard key={entry.item.id} item={entry.item} onRetry={onRetryUpload} onDismiss={onDismissUpload} />
    const fileKind = creatorLibraryKind(entry.file)
    if (fileKind === "image" || fileKind === "video") return <VisualFileCard key={entry.file.id} file={entry.file} usedCount={usageCounts?.get(entry.file.id) || 0} pending={pendingId === entry.file.id} onPreview={onPreview} onAddToTimeline={onAddToTimeline} onRemove={onRemove} />
    if (fileKind === "audio" || fileKind === "speech" || fileKind === "music" || fileKind === "sfx") return <div className="project-library-audio-entry" key={entry.file.id}><AudioFileCard file={entry.file} used={Boolean(usageCounts?.get(entry.file.id))} playing={playingFileId === entry.file.id} onPlay={onPlayAudio ? () => onPlayAudio(entry.file) : undefined} /><OperatorIconButton label={`Remove ${entry.file.name || "audio"} from Project`} detail="The File remains available in the Workspace Library." onClick={() => onRemove(entry.file)}><X /></OperatorIconButton></div>
    return <article className="project-library-generic-file" key={entry.file.id}><span>{fileKind === "subtitle" ? <Captions /> : <FileText />}</span><div><b>{entry.file.name || entry.file.title || entry.file.filename || "Untitled File"}</b><small>{fileKind === "subtitle" ? "Subtitle" : "File"}</small></div><OperatorIconButton label={`Remove ${entry.file.name || "File"} from Project`} detail="The File remains available in the Workspace Library." onClick={() => onRemove(entry.file)}><X /></OperatorIconButton></article>
  }

  return <section className="project-library-gallery" aria-label="Project Library files">
    <header>
      <div className="project-library-primary-tools">
        <label className="project-library-search"><Search aria-hidden="true" /><Input aria-label="Search Project Library" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names or tags" /></label>
        {folders.length > 0 && <Select value={folderId} onValueChange={setFolderId}><SelectTrigger aria-label="Project Library folder"><FolderOpen /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All folders</SelectItem><SelectItem value="root">Workspace root</SelectItem>{folders.map((folder) => <SelectItem key={folder.id} value={String(folder.id)}>{folder.name}</SelectItem>)}</SelectContent></Select>}
        <Button variant="outline" size="sm" onClick={onOpenLibrary}><FolderOpen />Workspace Files</Button>
        <Button variant="outline" size="sm" onClick={onUpload}><Upload />Upload</Button>
      </div>
      <div className="project-library-gallery-filters">
        <ToggleGroup type="single" variant="outline" size="sm" value={mediaFilter} onValueChange={(next) => { if (next) setMediaFilter(next as CreatorLibraryKind) }} aria-label="File type">
          <ToggleGroupItem value="all">All</ToggleGroupItem><ToggleGroupItem value="image">Images</ToggleGroupItem><ToggleGroupItem value="video">Videos</ToggleGroupItem><ToggleGroupItem value="audio">Audio</ToggleGroupItem><ToggleGroupItem value="speech">Speech</ToggleGroupItem><ToggleGroupItem value="music">Music</ToggleGroupItem><ToggleGroupItem value="sfx">Sound Effect</ToggleGroupItem><ToggleGroupItem value="subtitle">Subtitles</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" size="sm" value={originFilter} onValueChange={(next) => { if (next === "all" || next in FILE_SOURCE_PRESENTATION) setOriginFilter(next as "all" | FileSource) }} aria-label="File source">
          <ToggleGroupItem value="all">All sources</ToggleGroupItem>{(Object.keys(FILE_SOURCE_PRESENTATION) as FileSource[]).map((source) => <ToggleGroupItem key={source} value={source}>{FILE_SOURCE_PRESENTATION[source].label}</ToggleGroupItem>)}
        </ToggleGroup>
        {failedCount > 0 && <Button type="button" variant={showFailed ? "secondary" : "outline"} size="sm" aria-pressed={showFailed} onClick={() => setShowFailed((current) => !current)}>{showFailed ? <EyeOff /> : <AlertTriangle />}{showFailed ? "Hide failed" : "Show failed"} <span>{failedCount}</span></Button>}
      </div>
    </header>
    {!items.length && <div className="project-library-filter-empty"><Images /><p>No media matches this search or these filters.</p><Button variant="outline" size="sm" onClick={() => { setQuery(""); setFolderId("all"); setMediaFilter("all"); setOriginFilter("all"); setShowFailed(false) }}>Clear filters</Button></div>}
    <div ref={galleryRef} className={`project-library-gallery-items${items.length <= columnCount ? " is-single-row" : ""}`} style={{ "--project-library-gallery-columns": columnCount } as CSSProperties}>
      {items.map(renderEntry)}
    </div>
  </section>
}
