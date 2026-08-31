import { Images, Search, SlidersHorizontal } from "lucide-react"
import { useMemo, useState } from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { VentureAsset } from "@/types/domain"
import { visualAssetName } from "./director-assets"
import { VisualAssetCard } from "./visual-asset-card"

type AssetSourceFilter = "all" | "production" | "venture" | "studio"
type AssetUsageFilter = "all" | "used" | "unused"
type AssetSort = "recent" | "used" | "name"

export function DirectorLibraryDialog({ open, assets, productionAssetIds = [], usedAssetIds = [], pendingId, defaultSource = "all", showProductionSource = true, title = "Visual Assets", description = "Choose reusable image and video Assets available to this Production.", emptyDescription = "Upload a new image or video from Director.", addLabel = "Add", onOpenChange, onPreview, onAdd }: {
  open: boolean
  assets: VentureAsset[]
  productionAssetIds?: number[]
  usedAssetIds?: number[]
  pendingId: number | null
  defaultSource?: AssetSourceFilter
  showProductionSource?: boolean
  title?: string
  description?: string
  emptyDescription?: string
  addLabel?: string
  onOpenChange: (open: boolean) => void
  onPreview: (asset: VentureAsset) => void
  onAdd: (asset: VentureAsset) => void
}) {
  const [query, setQuery] = useState("")
  const [source, setSource] = useState<AssetSourceFilter>(defaultSource)
  const [mediaType, setMediaType] = useState<"all" | "image" | "video">("all")
  const [usage, setUsage] = useState<AssetUsageFilter>("all")
  const [sort, setSort] = useState<AssetSort>("recent")
  const productionIds = useMemo(() => new Set(productionAssetIds), [productionAssetIds])
  const usedIds = useMemo(() => new Set(usedAssetIds), [usedAssetIds])
  const usageCounts = useMemo(() => new Map(usedAssetIds.map((id) => [id, 1])), [usedAssetIds])
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return assets.filter((asset) => {
      if (normalized && !visualAssetName(asset).toLowerCase().includes(normalized) && !asset.tags?.some((tag) => tag.toLowerCase().includes(normalized))) return false
      if (mediaType !== "all" && asset.media_type !== mediaType) return false
      if (source === "production" && !productionIds.has(asset.id)) return false
      if (source === "venture" && asset.scope === "studio") return false
      if (source === "studio" && asset.scope !== "studio") return false
      if (usage === "used" && !usedIds.has(asset.id)) return false
      if (usage === "unused" && usedIds.has(asset.id)) return false
      return true
    }).sort((left, right) => {
      if (sort === "name") return visualAssetName(left).localeCompare(visualAssetName(right))
      if (sort === "used") {
        const delta = Number(usedIds.has(right.id)) - Number(usedIds.has(left.id))
        if (delta) return delta
      }
      return new Date(right.created_at || right.updated_at || 0).getTime() - new Date(left.created_at || left.updated_at || 0).getTime()
    })
  }, [assets, mediaType, productionIds, query, sort, source, usage, usedIds])
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="director-library-dialog">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <div className="director-library-toolbar">
        <label className="director-library-search"><Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names or tags" /></label>
        <Select value={source} onValueChange={(value) => setSource(value as AssetSourceFilter)}><SelectTrigger aria-label="Media source"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
          <SelectItem value="all">All available</SelectItem>
          {showProductionSource && <SelectItem value="production">This Production</SelectItem>}
          <SelectItem value="venture">This Venture</SelectItem>
          <SelectItem value="studio">Studio Library</SelectItem>
        </SelectGroup></SelectContent></Select>
        <Select value={mediaType} onValueChange={(value) => setMediaType(value as typeof mediaType)}><SelectTrigger aria-label="Media type"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Images & videos</SelectItem><SelectItem value="image">Images</SelectItem><SelectItem value="video">Videos</SelectItem></SelectGroup></SelectContent></Select>
        <Select value={usage} onValueChange={(value) => setUsage(value as AssetUsageFilter)}><SelectTrigger aria-label="Timeline usage"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Any usage</SelectItem><SelectItem value="used">Used in Timeline</SelectItem><SelectItem value="unused">Unused here</SelectItem></SelectGroup></SelectContent></Select>
        <Select value={sort} onValueChange={(value) => setSort(value as AssetSort)}><SelectTrigger aria-label="Sort media"><SlidersHorizontal /><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="recent">Recently added</SelectItem><SelectItem value="used">Used here first</SelectItem><SelectItem value="name">Name</SelectItem></SelectGroup></SelectContent></Select>
      </div>
      {visible.length
        ? <div className="director-library-grid">{visible.map((asset) => <VisualAssetCard key={asset.id} asset={asset} mode="library" usedCount={usageCounts.get(asset.id) || 0} pending={pendingId === asset.id} addLabel={addLabel} onPreview={onPreview} onAdd={onAdd} />)}</div>
        : <div className="director-library-empty"><Images /><h3>{assets.length ? "No matching visuals" : "No visuals available"}</h3><p>{assets.length ? "Try a different name." : emptyDescription}</p></div>}
    </DialogContent>
  </Dialog>
}
