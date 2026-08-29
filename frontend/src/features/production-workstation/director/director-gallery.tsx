import { Images, LayoutGrid, List } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { VentureAsset } from "@/types/domain"
import { DirectorUploadCard, type DirectorUploadItem } from "./director-upload-card"
import { VisualAssetCard } from "./visual-asset-card"

export type DirectorGalleryView = "gallery" | "list"
export type DirectorCreationItem = { id: string; node: ReactNode }

const directorViewStorageKey = "auvi-director-gallery-view"

function initialGalleryView(): DirectorGalleryView {
  if (typeof window === "undefined") return "gallery"
  try {
    return window.localStorage.getItem(directorViewStorageKey) === "list" ? "list" : "gallery"
  } catch {
    return "gallery"
  }
}

function galleryColumnCount(width: number) {
  if (width < 440) return 1
  if (width < 650) return 2
  if (width < 880) return 3
  if (width < 1120) return 4
  return 5
}

export function DirectorGallery({ assets, uploads, creationItems = [], footer, pendingId, onPreview, onAddToTimeline, onRemove, onRetryUpload, onDismissUpload, onUpload, onOpenLibrary }: {
  assets: VentureAsset[]
  uploads: DirectorUploadItem[]
  creationItems?: DirectorCreationItem[]
  footer?: ReactNode
  pendingId: number | null
  onPreview: (asset: VentureAsset) => void
  onAddToTimeline?: (asset: VentureAsset) => void
  onRemove: (asset: VentureAsset) => void
  onRetryUpload: (item: DirectorUploadItem) => void
  onDismissUpload: (item: DirectorUploadItem) => void
  onUpload: () => void
  onOpenLibrary: () => void
}) {
  const [view, setView] = useState<DirectorGalleryView>(initialGalleryView)
  const [columnCount, setColumnCount] = useState(5)
  const galleryRef = useRef<HTMLDivElement>(null)
  const items = useMemo(() => [
    ...creationItems.map(({ id, node }) => ({ kind: "generation" as const, id, node })),
    ...uploads.map((item) => ({ kind: "upload" as const, item })),
    ...assets.map((asset) => ({ kind: "asset" as const, asset })),
  ], [assets, creationItems, uploads])
  const columns = useMemo(() => {
    const next = Array.from({ length: columnCount }, () => [] as (typeof items)[number][])
    const heights = Array.from({ length: columnCount }, () => 0)
    for (const entry of items) {
      const target = heights.indexOf(Math.min(...heights))
      const column = next[target]
      if (!column) continue
      column.push(entry)
      if (entry.kind === "upload") {
        heights[target] = (heights[target] ?? 0) + 0.95
      } else if (entry.kind === "generation") {
        heights[target] = (heights[target] ?? 0) + 1.35
      } else {
        const mediaRatio = entry.asset.width && entry.asset.height
          ? entry.asset.height / entry.asset.width
          : 0.75
        heights[target] = (heights[target] ?? 0) + Math.min(1.9, Math.max(0.55, mediaRatio)) + 0.32
      }
    }
    return next
  }, [columnCount, items])

  useEffect(() => {
    if (view !== "gallery") return
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
  }, [view])

  function changeView(next: string) {
    if (next !== "gallery" && next !== "list") return
    setView(next)
    try { window.localStorage.setItem(directorViewStorageKey, next) } catch { /* Storage can be unavailable. */ }
  }

  if (!items.length) return <section className="director-empty" aria-label="Director is empty">
    <span><Images aria-hidden="true" /></span>
    <h2>No visuals collected yet</h2>
    <p>Upload files above or choose from Library. Director keeps the material here; you decide what enters Timeline.</p>
    <div><Button onClick={onUpload}>Upload visuals</Button><Button variant="outline" onClick={onOpenLibrary}>Open Library</Button></div>
  </section>

  function renderEntry(entry: (typeof items)[number], view: DirectorGalleryView) {
    if (entry.kind === "generation") return <div className="director-generation-gallery-entry" key={`generation-${entry.id}`}>{entry.node}</div>
    if (entry.kind === "upload") return <DirectorUploadCard key={entry.item.id} item={entry.item} view={view} onRetry={onRetryUpload} onDismiss={onDismissUpload} />
    return <VisualAssetCard key={entry.asset.id} asset={entry.asset} view={view} pending={pendingId === entry.asset.id} onPreview={onPreview} onAddToTimeline={onAddToTimeline} onRemove={onRemove} />
  }

  return <section className="director-gallery" aria-label="Creation gallery">
    <header>
      <p>{creationItems.length ? `${creationItems.length} recent ${creationItems.length === 1 ? "request" : "requests"} · ` : ""}{assets.length} ready media item{assets.length === 1 ? "" : "s"}{uploads.length ? ` · ${uploads.length} uploading` : ""}</p>
      <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={changeView} aria-label="Gallery view">
        <ToggleGroupItem value="gallery" aria-label="Gallery view"><LayoutGrid /> Gallery</ToggleGroupItem>
        <ToggleGroupItem value="list" aria-label="List view"><List /> List</ToggleGroupItem>
      </ToggleGroup>
    </header>
    <div
      ref={galleryRef}
      className={`director-gallery-items is-${view}`}
      data-view={view}
      style={view === "gallery" ? { "--director-gallery-columns": columnCount } as CSSProperties : undefined}
    >
      {view === "gallery"
        ? columns.map((column, index) => <div className="director-gallery-column" key={index}>
          {column.map((entry) => renderEntry(entry, view))}
        </div>)
        : items.map((entry) => renderEntry(entry, view))}
    </div>
    {footer}
  </section>
}
