import { AudioLines, Clock3, Film, Image, Search, Upload } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SavedVisualReference, VentureAsset } from "@/types/domain"
import { visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "../director-assets"
import type { DirectorAttachmentKind } from "./director-composer-config"

type SortMode = "used" | "added" | "name"

function mediaIcon(kind?: string) {
  return kind === "audio" ? AudioLines : kind === "video" ? Film : Image
}

export function DirectorReferenceLibraryDialog({ open, title, assets, recentAssetIds = [], savedReferences = [], acceptedMediaTypes, compatibility, checking = false, onOpenChange, onAdd, onAddReference, onUpload }: {
  open: boolean
  title?: string
  assets: VentureAsset[]
  recentAssetIds?: number[]
  savedReferences?: SavedVisualReference[]
  acceptedMediaTypes: DirectorAttachmentKind[]
  compatibility?: ReadonlyMap<number, { state: "compatible" | "incompatible" | "unknown"; reasons: string[] }>
  checking?: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (asset: VentureAsset) => void
  onAddReference?: (reference: SavedVisualReference) => void
  onUpload?: () => void
}) {
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<"recent" | "all" | "space" | "studio">("recent")
  const [sort, setSort] = useState<SortMode>("used")
  const recentOrder = useMemo(() => new Map(recentAssetIds.map((id, index) => [id, index])), [recentAssetIds])
  const mediaTypeCandidates = useMemo(() => assets.filter((asset) => acceptedMediaTypes.includes(asset.media_type as DirectorAttachmentKind)), [acceptedMediaTypes, assets])
  const compatible = useMemo(() => mediaTypeCandidates.filter((asset) => !compatibility || compatibility.get(asset.id)?.state === "compatible"), [compatibility, mediaTypeCandidates])
  const unknownCount = useMemo(() => mediaTypeCandidates.filter((asset) => compatibility?.get(asset.id)?.state === "unknown").length, [compatibility, mediaTypeCandidates])
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const sorted = compatible
      .filter((asset) => scope === "space" ? asset.scope === "space" : scope === "studio" ? asset.scope === "studio" : true)
      .filter((asset) => !normalized || visualAssetName(asset).toLowerCase().includes(normalized) || asset.tags?.some((tag) => tag.toLowerCase().includes(normalized)))
      .sort((left, right) => {
        if (sort === "name") return visualAssetName(left).localeCompare(visualAssetName(right))
        if (sort === "used") {
          const leftOrder = recentOrder.get(left.id) ?? Number.POSITIVE_INFINITY
          const rightOrder = recentOrder.get(right.id) ?? Number.POSITIVE_INFINITY
          if (leftOrder !== rightOrder) return leftOrder - rightOrder
        }
        const leftTime = new Date(left.created_at || left.updated_at || 0).getTime()
        const rightTime = new Date(right.created_at || right.updated_at || 0).getTime()
        return rightTime - leftTime
      })
    return scope === "recent" && !normalized ? sorted.slice(0, 24) : sorted
  }, [compatible, query, recentOrder, scope, sort])

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="director-reference-dialog">
      <DialogHeader>
        <DialogTitle>{title ? `Choose ${title.toLowerCase()}` : "Choose a reference"}</DialogTitle>
        <DialogDescription>Choose compatible media from this Venture, or upload a new item for this exact input.</DialogDescription>
      </DialogHeader>
      <div className="director-reference-picker-nav">
        <Tabs value={scope} onValueChange={(value) => setScope(value as typeof scope)}><TabsList><TabsTrigger value="recent">Recent</TabsTrigger><TabsTrigger value="space">This Space</TabsTrigger><TabsTrigger value="studio">Studio Library</TabsTrigger><TabsTrigger value="all">All available</TabsTrigger></TabsList></Tabs>
        {onUpload && <Button type="button" variant="outline" onClick={onUpload}><Upload />Upload</Button>}
      </div>
      <div className="director-reference-picker-tools">
        <label className="director-library-search"><Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names or tags" /></label>
        <Select value={sort} onValueChange={(value) => setSort(value as SortMode)}><SelectTrigger aria-label="Sort media"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="used">Used here first</SelectItem><SelectItem value="added">Recently added</SelectItem><SelectItem value="name">Name</SelectItem></SelectContent></Select>
      </div>
      {savedReferences.length > 0 && <section className="director-saved-reference-list"><header>Saved reference sets</header><div>{savedReferences.map((reference) => <Button key={reference.id} type="button" variant="outline" size="sm" onClick={() => onAddReference?.(reference)}><Image />{reference.name}<small>{reference.asset_ids.length}</small></Button>)}</div></section>}
      {unknownCount > 0 && !checking && <p className="director-reference-metadata-note">{unknownCount} {unknownCount === 1 ? "item needs" : "items need"} technical metadata before this model can use {unknownCount === 1 ? "it" : "them"}.</p>}
      <div className="director-reference-grid" aria-label="Compatible Venture media">
        {visible.map((asset) => {
          const Icon = mediaIcon(asset.media_type)
          const name = visualAssetName(asset)
          const preview = asset.media_type === "video" ? visualAssetPosterUrl(asset) : asset.media_type === "image" ? visualAssetUrl(asset) : null
          const ratio = asset.width && asset.height ? `${asset.width} / ${asset.height}` : "4 / 3"
          return <button key={asset.id} type="button" className="director-reference-item" aria-label={`Use ${name}`} title={name} onClick={() => onAdd(asset)}>
            <span className="director-reference-thumb" style={{ aspectRatio: ratio }}>{preview ? <img src={preview} alt="" /> : <Icon />}
              <span className="director-reference-kind"><Icon />{asset.media_type === "video" ? "Video" : asset.media_type === "audio" ? "Audio" : "Image"}</span>
              {asset.duration_ms ? <span className="director-reference-duration"><Clock3 />{Math.round(asset.duration_ms / 100) / 10}s</span> : null}
            </span>
          </button>
        })}
        {!visible.length && <div className="director-reference-empty"><p>{checking ? "Checking technical compatibility…" : query ? "No compatible media matches this search." : "No compatible media is available for this exact input."}</p>{!checking && onUpload && <Button type="button" onClick={onUpload}><Upload />Upload compatible media</Button>}</div>}
      </div>
    </DialogContent>
  </Dialog>
}
