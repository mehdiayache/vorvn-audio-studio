import { AudioLines, Clock3, Film, Image, Search, Upload } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createLibraryQuery, queryLibraryFiles } from "@/features/library/library-query"
import type { SavedVisualReference, WorkspaceFile } from "@/types/domain"
import { visualFileName, visualFilePosterUrl, visualFileUrl } from "@/features/creator/library/visual-file-presentation"
import type { MediaAttachmentKind } from "./media-creator-config"

type SortMode = "production" | "added" | "name"

function mediaIcon(kind?: string) {
  return kind === "audio" ? AudioLines : kind === "video" ? Film : Image
}

export function MediaReferenceLibraryDialog({ open, title, files, recentFileIds = [], savedReferences = [], acceptedMediaTypes, compatibility, checking = false, onOpenChange, onAdd, onAddReference, onUpload }: {
  open: boolean
  title?: string
  files: WorkspaceFile[]
  recentFileIds?: number[]
  savedReferences?: SavedVisualReference[]
  acceptedMediaTypes: MediaAttachmentKind[]
  compatibility?: ReadonlyMap<number, { state: "compatible" | "incompatible" | "unknown"; reasons: string[] }>
  checking?: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (file: WorkspaceFile) => void
  onAddReference?: (reference: SavedVisualReference) => void
  onUpload?: () => void
}) {
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<"recent" | "all">("recent")
  const [sort, setSort] = useState<SortMode>("production")
  const recentOrder = useMemo(() => new Map(recentFileIds.map((id, index) => [id, index])), [recentFileIds])
  const mediaTypeCandidates = useMemo(() => files.filter((file) => acceptedMediaTypes.includes(file.media_type as MediaAttachmentKind)), [acceptedMediaTypes, files])
  const compatible = useMemo(() => mediaTypeCandidates.filter((file) => !compatibility || compatibility.get(file.id)?.state === "compatible"), [compatibility, mediaTypeCandidates])
  const unknownCount = useMemo(() => mediaTypeCandidates.filter((file) => compatibility?.get(file.id)?.state === "unknown").length, [compatibility, mediaTypeCandidates])
  const visible = useMemo(() => {
    const queried = queryLibraryFiles(compatible, createLibraryQuery({
      search: query,
      sort: sort === "name" ? "name" : "recent",
    }))
    const sorted = sort === "production"
      ? [...queried].sort((left, right) => {
          const leftOrder = recentOrder.get(left.id) ?? Number.POSITIVE_INFINITY
          const rightOrder = recentOrder.get(right.id) ?? Number.POSITIVE_INFINITY
          if (leftOrder !== rightOrder) return leftOrder - rightOrder
          return queried.indexOf(left) - queried.indexOf(right)
        })
      : queried
    return scope === "recent" && !query.trim() ? sorted.slice(0, 24) : sorted
  }, [compatible, query, recentOrder, scope, sort])

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="media-reference-dialog">
      <DialogHeader>
        <DialogTitle>{title ? `Choose ${title.toLowerCase()}` : "Choose a reference"}</DialogTitle>
        <DialogDescription>Choose compatible media from this Workspace, or upload a new File for this exact input.</DialogDescription>
      </DialogHeader>
      <div className="media-reference-picker-nav">
        <Tabs value={scope} onValueChange={(value) => setScope(value as typeof scope)}><TabsList><TabsTrigger value="recent">Recent</TabsTrigger><TabsTrigger value="all">All Workspace Files</TabsTrigger></TabsList></Tabs>
        {onUpload && <Button type="button" variant="outline" onClick={onUpload}><Upload />Upload</Button>}
      </div>
      <div className="media-reference-picker-tools">
        <label className="media-library-search"><Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names or tags" /></label>
        <Select value={sort} onValueChange={(value) => setSort(value as SortMode)}><SelectTrigger aria-label="Sort media"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="production">Production Files first</SelectItem><SelectItem value="added">Recently added</SelectItem><SelectItem value="name">Name</SelectItem></SelectContent></Select>
      </div>
      {savedReferences.length > 0 && <section className="media-saved-reference-list"><header>Saved reference sets</header><div>{savedReferences.map((reference) => <Button key={reference.id} type="button" variant="outline" size="sm" onClick={() => onAddReference?.(reference)}><Image />{reference.name}<small>{reference.file_ids.length}</small></Button>)}</div></section>}
      {unknownCount > 0 && !checking && <p className="media-reference-metadata-note">{unknownCount} {unknownCount === 1 ? "item needs" : "items need"} technical metadata before this model can use {unknownCount === 1 ? "it" : "them"}.</p>}
      <div className="media-reference-grid" aria-label="Compatible Workspace media">
        {visible.map((file) => {
          const Icon = mediaIcon(file.media_type)
          const name = visualFileName(file)
          const preview = file.media_type === "video" ? visualFilePosterUrl(file) : file.media_type === "image" ? visualFileUrl(file) : null
          const ratio = file.width && file.height ? `${file.width} / ${file.height}` : "4 / 3"
          return <button key={file.id} type="button" className="media-reference-item" aria-label={`Use ${name}`} title={name} onClick={() => onAdd(file)}>
            <span className="media-reference-thumb" style={{ aspectRatio: ratio }}>{preview ? <img src={preview} alt="" /> : <Icon />}
              <span className="media-reference-kind"><Icon />{file.media_type === "video" ? "Video" : file.media_type === "audio" ? "Audio" : "Image"}</span>
              {file.duration_ms ? <span className="media-reference-duration"><Clock3 />{Math.round(file.duration_ms / 100) / 10}s</span> : null}
            </span>
          </button>
        })}
        {!visible.length && <div className="media-reference-empty"><p>{checking ? "Checking technical compatibility…" : query ? "No compatible media matches this search." : "No compatible media is available for this exact input."}</p>{!checking && onUpload && <Button type="button" onClick={onUpload}><Upload />Upload compatible media</Button>}</div>}
      </div>
    </DialogContent>
  </Dialog>
}
