import { AlertTriangle, EyeOff, Images } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { assetSource } from "@/lib/asset-provenance"
import type { VentureAsset } from "@/types/domain"
import { DirectorUploadCard, type DirectorUploadItem } from "./director-upload-card"
import { VisualAssetCard } from "./visual-asset-card"

export type DirectorCreationItem = {
  id: string
  node: ReactNode
  status?: "queued" | "generating" | "ready" | "canceled" | "failed"
  mediaType?: "image" | "video"
  createdAt?: string | null
}

function galleryColumnCount(width: number) {
  if (width < 400) return 1
  if (width < 580) return 2
  if (width < 740) return 3
  if (width < 880) return 4
  return 5
}

export function DirectorGallery({ assets, uploads, creationItems = [], usageCounts, pendingId, onPreview, onAddToTimeline, onRemove, onRetryUpload, onDismissUpload, onUpload, onOpenLibrary }: {
  assets: VentureAsset[]
  uploads: DirectorUploadItem[]
  creationItems?: DirectorCreationItem[]
  usageCounts?: ReadonlyMap<number, number>
  pendingId: number | null
  onPreview: (asset: VentureAsset) => void
  onAddToTimeline?: (asset: VentureAsset) => void
  onRemove: (asset: VentureAsset) => void
  onRetryUpload: (item: DirectorUploadItem) => void
  onDismissUpload: (item: DirectorUploadItem) => void
  onUpload: () => void
  onOpenLibrary: () => void
}) {
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "video">("all")
  const [originFilter, setOriginFilter] = useState<"all" | "generated" | "uploaded" | "library">("all")
  const [showFailed, setShowFailed] = useState(false)
  const [columnCount, setColumnCount] = useState(5)
  const galleryRef = useRef<HTMLDivElement>(null)
  const failedCount = creationItems.filter(({ status }) => status === "failed" || status === "canceled").length
  const items = useMemo(() => {
    const candidates = [
      ...creationItems.map(({ id, node, status, mediaType, createdAt }, order) => ({ kind: "generation" as const, origin: "generated" as const, id, node, status, mediaType, createdAt, order })),
      ...uploads.map((item, order) => ({ kind: "upload" as const, origin: "uploaded" as const, item, mediaType: item.file.type.startsWith("video/") ? "video" as const : "image" as const, createdAt: null, order: creationItems.length + order })),
      ...assets.map((asset, order) => ({ kind: "asset" as const, origin: assetSource(asset), asset, mediaType: asset.media_type === "video" ? "video" as const : "image" as const, createdAt: asset.created_at || asset.updated_at || null, order: creationItems.length + uploads.length + order })),
    ]
    return candidates
      .filter((entry) => entry.kind !== "generation" || showFailed || (entry.status !== "failed" && entry.status !== "canceled"))
      .filter((entry) => mediaFilter === "all" || entry.mediaType === mediaFilter)
      .filter((entry) => originFilter === "all" || entry.origin === originFilter)
      .sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : Number.NaN
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : Number.NaN
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return rightTime - leftTime
        return left.order - right.order
      })
  }, [assets, creationItems, mediaFilter, originFilter, showFailed, uploads])

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

  if (!creationItems.length && !uploads.length && !assets.length) return <section className="director-empty" aria-label="Director is empty">
    <span><Images aria-hidden="true" /></span>
    <h2>No visuals collected yet</h2>
    <p>Upload files above or choose from Library. Director keeps the material here; you decide what enters Timeline.</p>
    <div><Button onClick={onUpload}>Upload visuals</Button><Button variant="outline" onClick={onOpenLibrary}>Open Library</Button></div>
  </section>

  function renderEntry(entry: (typeof items)[number]) {
    if (entry.kind === "generation") return <div className="director-generation-gallery-entry" key={`generation-${entry.id}`}>{entry.node}</div>
    if (entry.kind === "upload") return <DirectorUploadCard key={entry.item.id} item={entry.item} onRetry={onRetryUpload} onDismiss={onDismissUpload} />
    return <VisualAssetCard key={entry.asset.id} asset={entry.asset} usedCount={usageCounts?.get(entry.asset.id) || 0} pending={pendingId === entry.asset.id} onPreview={onPreview} onAddToTimeline={onAddToTimeline} onRemove={onRemove} />
  }

  return <section className="director-gallery" aria-label="Creation gallery">
    <header>
      <div className="director-gallery-filters">
        <ToggleGroup type="single" variant="outline" size="sm" value={mediaFilter} onValueChange={(next) => { if (next === "all" || next === "image" || next === "video") setMediaFilter(next) }} aria-label="Media type">
          <ToggleGroupItem value="all">All media</ToggleGroupItem>
          <ToggleGroupItem value="image">Images</ToggleGroupItem>
          <ToggleGroupItem value="video">Videos</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" size="sm" value={originFilter} onValueChange={(next) => { if (next === "all" || next === "generated" || next === "uploaded" || next === "library") setOriginFilter(next) }} aria-label="Media origin">
          <ToggleGroupItem value="all">All sources</ToggleGroupItem>
          <ToggleGroupItem value="generated">Generated</ToggleGroupItem>
          <ToggleGroupItem value="uploaded">Uploaded</ToggleGroupItem>
          <ToggleGroupItem value="library">Imported</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {failedCount > 0 && <Button type="button" variant={showFailed ? "secondary" : "outline"} size="sm" aria-pressed={showFailed} onClick={() => setShowFailed((current) => !current)}>{showFailed ? <EyeOff /> : <AlertTriangle />}{showFailed ? "Hide failed" : "Show failed"} <span>{failedCount}</span></Button>}
    </header>
    {!items.length && <div className="director-filter-empty"><Images /><p>No media matches these filters.</p><Button variant="outline" size="sm" onClick={() => { setMediaFilter("all"); setOriginFilter("all"); setShowFailed(false) }}>Clear filters</Button></div>}
    <div ref={galleryRef} className={`director-gallery-items${items.length <= columnCount ? " is-single-row" : ""}`} style={{ "--director-gallery-columns": columnCount } as CSSProperties}>
      {items.map(renderEntry)}
    </div>
  </section>
}
