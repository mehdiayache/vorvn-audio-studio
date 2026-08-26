import { Images, LayoutGrid, List } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { VentureAsset } from "@/types/domain"
import { DirectorUploadCard, type DirectorUploadItem } from "./director-upload-card"
import { VisualAssetCard } from "./visual-asset-card"

export type DirectorGalleryView = "gallery" | "list"

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

export function DirectorGallery({ assets, uploads, pendingId, onPreview, onRemove, onRetryUpload, onDismissUpload, onUpload, onOpenLibrary }: {
  assets: VentureAsset[]
  uploads: DirectorUploadItem[]
  pendingId: number | null
  onPreview: (asset: VentureAsset) => void
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
    ...uploads.map((item) => ({ kind: "upload" as const, item })),
    ...assets.map((asset) => ({ kind: "asset" as const, asset })),
  ], [assets, uploads])
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
    <h2>Create the visual world for this Production</h2>
    <p>Upload images or video, or choose existing visuals from your Library. Nothing is placed on the Timeline until you choose to place it there.</p>
    <div><Button onClick={onUpload}>Upload visuals</Button><Button variant="outline" onClick={onOpenLibrary}>Open Visual Library</Button></div>
  </section>

  return <section className="director-gallery" aria-labelledby="director-gallery-title">
    <header>
      <div><h2 id="director-gallery-title">Production visuals</h2><p>{assets.length} collected {assets.length === 1 ? "asset" : "assets"}{uploads.length ? ` · ${uploads.length} in progress` : ""}</p></div>
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
          {column.map((entry) => entry.kind === "upload"
            ? <DirectorUploadCard key={entry.item.id} item={entry.item} view={view} onRetry={onRetryUpload} onDismiss={onDismissUpload} />
            : <VisualAssetCard key={entry.asset.id} asset={entry.asset} view={view} pending={pendingId === entry.asset.id} onPreview={onPreview} onRemove={onRemove} />)}
        </div>)
        : items.map((entry) => entry.kind === "upload"
          ? <DirectorUploadCard key={entry.item.id} item={entry.item} view={view} onRetry={onRetryUpload} onDismiss={onDismissUpload} />
          : <VisualAssetCard key={entry.asset.id} asset={entry.asset} view={view} pending={pendingId === entry.asset.id} onPreview={onPreview} onRemove={onRemove} />)}
    </div>
  </section>
}
