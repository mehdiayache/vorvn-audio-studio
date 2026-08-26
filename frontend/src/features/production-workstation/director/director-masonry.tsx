import { Images } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { VentureAsset } from "@/types/domain"
import { VisualAssetCard } from "./visual-asset-card"

export function DirectorMasonry({ assets, pendingId, onPreview, onRemove, onUpload, onOpenLibrary }: {
  assets: VentureAsset[]
  pendingId: number | null
  onPreview: (asset: VentureAsset) => void
  onRemove: (asset: VentureAsset) => void
  onUpload: () => void
  onOpenLibrary: () => void
}) {
  if (!assets.length) return <section className="director-empty" aria-label="Director is empty">
    <span><Images aria-hidden="true" /></span>
    <h2>Create the visual world for this Production</h2>
    <p>Upload images or video, or choose existing visuals from your Library. Nothing is placed on the Timeline until you choose to place it there.</p>
    <div><Button onClick={onUpload}>Upload visuals</Button><Button variant="outline" onClick={onOpenLibrary}>Open Visual Library</Button></div>
  </section>
  return <section className="director-gallery" aria-labelledby="director-gallery-title">
    <header><div><h2 id="director-gallery-title">Production visuals</h2><p>{assets.length} collected {assets.length === 1 ? "asset" : "assets"}</p></div></header>
    <div className="director-masonry">{assets.map((asset) => <VisualAssetCard key={asset.id} asset={asset} pending={pendingId === asset.id} onPreview={onPreview} onRemove={onRemove} />)}</div>
  </section>
}
