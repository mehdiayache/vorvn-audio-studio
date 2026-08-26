import { Images } from "lucide-react"
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import type { VentureAsset } from "@/types/domain"
import { VisualAssetCard } from "./visual-asset-card"
import { DirectorUploadCard, type DirectorUploadItem } from "./director-upload-card"

export function DirectorMasonry({ assets, uploads, pendingId, onPreview, onRemove, onRetryUpload, onDismissUpload, onUpload, onOpenLibrary }: {
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
  const galleryRef = useRef<HTMLDivElement>(null)
  const [maxColumns, setMaxColumns] = useState(4)
  const items = useMemo(() => [
    ...uploads.map((item) => ({ kind: "upload" as const, item, weight: .9 })),
    ...assets.map((asset) => ({
      kind: "asset" as const,
      asset,
      weight: asset.width && asset.height ? Math.min(1.7, Math.max(.72, asset.height / asset.width)) + .28 : .9,
    })),
  ], [assets, uploads])
  const columnCount = Math.max(1, Math.min(maxColumns, items.length))
  const columns = useMemo(() => {
    const result = Array.from({ length: columnCount }, () => ({ weight: 0, items: [] as typeof items }))
    items.forEach((item) => {
      const target = result.reduce((shortest, column) => column.weight < shortest.weight ? column : shortest, result[0]!)
      target.items.push(item)
      target.weight += item.weight
    })
    return result
  }, [columnCount, items])

  useEffect(() => {
    const node = galleryRef.current
    if (!node || typeof ResizeObserver === "undefined") return
    const update = (width: number) => setMaxColumns(width >= 1120 ? 4 : width >= 780 ? 3 : width >= 520 ? 2 : 1)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) update(entry.contentRect.width)
    })
    update(node.getBoundingClientRect().width)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  if (!items.length) return <section className="director-empty" aria-label="Director is empty">
    <span><Images aria-hidden="true" /></span>
    <h2>Create the visual world for this Production</h2>
    <p>Upload images or video, or choose existing visuals from your Library. Nothing is placed on the Timeline until you choose to place it there.</p>
    <div><Button onClick={onUpload}>Upload visuals</Button><Button variant="outline" onClick={onOpenLibrary}>Open Visual Library</Button></div>
  </section>
  return <section className="director-gallery" aria-labelledby="director-gallery-title">
    <header><div><h2 id="director-gallery-title">Production visuals</h2><p>{assets.length} collected {assets.length === 1 ? "asset" : "assets"}{uploads.length ? ` · ${uploads.length} in progress` : ""}</p></div></header>
    <div ref={galleryRef} className="director-masonry" style={{ "--director-columns": columnCount } as CSSProperties}>
      {columns.map((column, index) => <div className="director-masonry-column" key={index}>{column.items.map((entry) => entry.kind === "upload"
        ? <DirectorUploadCard key={entry.item.id} item={entry.item} onRetry={onRetryUpload} onDismiss={onDismissUpload} />
        : <VisualAssetCard key={entry.asset.id} asset={entry.asset} pending={pendingId === entry.asset.id} onPreview={onPreview} onRemove={onRemove} />)}</div>)}
    </div>
  </section>
}
