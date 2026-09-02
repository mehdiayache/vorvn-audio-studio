import { Images, Search, SlidersHorizontal } from "lucide-react"
import { useMemo, useState } from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { WorkspaceFile } from "@/types/domain"
import { visualFileName } from "./visuals-files"
import { VisualFileCard } from "./visual-file-card"

type FileSourceFilter = "all" | "project"
type FileUsageFilter = "all" | "used" | "unused"
type FileSort = "recent" | "used" | "name"

export function VisualsLibraryDialog({ open, files, projectFileIds = [], usedFileIds = [], pendingId, defaultSource = "all", showProjectSource = true, title = "Visual Files", description = "Choose reusable image and video Files available to this Project.", emptyDescription = "Upload a new image or video from Visuals.", addLabel = "Add", onOpenChange, onPreview, onAdd }: {
  open: boolean
  files: WorkspaceFile[]
  projectFileIds?: number[]
  usedFileIds?: number[]
  pendingId: number | null
  defaultSource?: FileSourceFilter
  showProjectSource?: boolean
  title?: string
  description?: string
  emptyDescription?: string
  addLabel?: string
  onOpenChange: (open: boolean) => void
  onPreview: (file: WorkspaceFile) => void
  onAdd: (file: WorkspaceFile) => void
}) {
  const [query, setQuery] = useState("")
  const [source, setSource] = useState<FileSourceFilter>(defaultSource)
  const [mediaType, setMediaType] = useState<"all" | "image" | "video">("all")
  const [usage, setUsage] = useState<FileUsageFilter>("all")
  const [sort, setSort] = useState<FileSort>("recent")
  const projectIds = useMemo(() => new Set(projectFileIds), [projectFileIds])
  const usedIds = useMemo(() => new Set(usedFileIds), [usedFileIds])
  const usageCounts = useMemo(() => new Map(usedFileIds.map((id) => [id, 1])), [usedFileIds])
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return files.filter((file) => {
      if (normalized && !visualFileName(file).toLowerCase().includes(normalized) && !file.tags?.some((tag) => tag.toLowerCase().includes(normalized))) return false
      if (mediaType !== "all" && file.media_type !== mediaType) return false
      if (source === "project" && !projectIds.has(file.id)) return false
      if (usage === "used" && !usedIds.has(file.id)) return false
      if (usage === "unused" && usedIds.has(file.id)) return false
      return true
    }).sort((left, right) => {
      if (sort === "name") return visualFileName(left).localeCompare(visualFileName(right))
      if (sort === "used") {
        const delta = Number(usedIds.has(right.id)) - Number(usedIds.has(left.id))
        if (delta) return delta
      }
      return new Date(right.created_at || right.updated_at || 0).getTime() - new Date(left.created_at || left.updated_at || 0).getTime()
    })
  }, [files, mediaType, projectIds, query, sort, source, usage, usedIds])
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="visuals-library-dialog">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <div className="visuals-library-toolbar">
        <label className="visuals-library-search"><Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names or tags" /></label>
        <Select value={source} onValueChange={(value) => setSource(value as FileSourceFilter)}><SelectTrigger aria-label="Media source"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
          <SelectItem value="all">All available</SelectItem>
          {showProjectSource && <SelectItem value="project">This Project</SelectItem>}
        </SelectGroup></SelectContent></Select>
        <Select value={mediaType} onValueChange={(value) => setMediaType(value as typeof mediaType)}><SelectTrigger aria-label="Media type"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Images & videos</SelectItem><SelectItem value="image">Images</SelectItem><SelectItem value="video">Videos</SelectItem></SelectGroup></SelectContent></Select>
        <Select value={usage} onValueChange={(value) => setUsage(value as FileUsageFilter)}><SelectTrigger aria-label="Timeline usage"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Any usage</SelectItem><SelectItem value="used">Used in Timeline</SelectItem><SelectItem value="unused">Unused here</SelectItem></SelectGroup></SelectContent></Select>
        <Select value={sort} onValueChange={(value) => setSort(value as FileSort)}><SelectTrigger aria-label="Sort media"><SlidersHorizontal /><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="recent">Recently added</SelectItem><SelectItem value="used">Used here first</SelectItem><SelectItem value="name">Name</SelectItem></SelectGroup></SelectContent></Select>
      </div>
      {visible.length
        ? <div className="visuals-library-grid">{visible.map((file) => <VisualFileCard key={file.id} file={file} mode="library" usedCount={usageCounts.get(file.id) || 0} pending={pendingId === file.id} addLabel={addLabel} onPreview={onPreview} onAdd={onAdd} />)}</div>
        : <div className="visuals-library-empty"><Images /><h3>{files.length ? "No matching visuals" : "No visuals available"}</h3><p>{files.length ? "Try a different name." : emptyDescription}</p></div>}
    </DialogContent>
  </Dialog>
}
