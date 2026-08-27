import { Images, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { VentureAsset } from "@/types/domain"
import { visualAssetName } from "./director-assets"
import { VisualAssetCard } from "./visual-asset-card"

export function DirectorLibraryDialog({ open, assets, pendingId, title = "Visual Library", description = "Choose reusable images and videos already available to this Production.", emptyDescription = "Upload a new image or video from Director.", onOpenChange, onPreview, onAdd }: {
  open: boolean
  assets: VentureAsset[]
  pendingId: number | null
  title?: string
  description?: string
  emptyDescription?: string
  onOpenChange: (open: boolean) => void
  onPreview: (asset: VentureAsset) => void
  onAdd: (asset: VentureAsset) => void
}) {
  const [query, setQuery] = useState("")
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized ? assets.filter((asset) => visualAssetName(asset).toLowerCase().includes(normalized)) : assets
  }, [assets, query])
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="director-library-dialog">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <label className="director-library-search"><Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search visuals" /></label>
      {visible.length
        ? <div className="director-library-grid">{visible.map((asset) => <VisualAssetCard key={asset.id} asset={asset} mode="library" pending={pendingId === asset.id} onPreview={onPreview} onAdd={onAdd} />)}</div>
        : <div className="director-library-empty"><Images /><h3>{assets.length ? "No matching visuals" : "No visuals available"}</h3><p>{assets.length ? "Try a different name." : emptyDescription}</p></div>}
    </DialogContent>
  </Dialog>
}
