import { AudioLines, Film, Image, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { VentureAsset } from "@/types/domain"
import { visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "../director-assets"
import type { DirectorAttachmentKind } from "./director-composer-config"

function mediaIcon(kind?: string) {
  return kind === "audio" ? AudioLines : kind === "video" ? Film : Image
}

export function DirectorReferenceLibraryDialog({ open, assets, acceptedMediaTypes, onOpenChange, onAdd }: {
  open: boolean
  assets: VentureAsset[]
  acceptedMediaTypes: DirectorAttachmentKind[]
  onOpenChange: (open: boolean) => void
  onAdd: (asset: VentureAsset) => void
}) {
  const [query, setQuery] = useState("")
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return assets.filter((asset) => acceptedMediaTypes.includes(asset.media_type as DirectorAttachmentKind))
      .filter((asset) => !normalized || visualAssetName(asset).toLowerCase().includes(normalized))
  }, [acceptedMediaTypes, assets, query])
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="director-reference-dialog">
      <DialogHeader><DialogTitle>Choose a reference</DialogTitle><DialogDescription>Every item is a reusable canonical Asset already available to this Production.</DialogDescription></DialogHeader>
      <label className="director-library-search"><Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search available media" /></label>
      <div className="director-reference-list">
        {visible.map((asset) => {
          const Icon = mediaIcon(asset.media_type)
          const name = visualAssetName(asset)
          const preview = asset.media_type === "video" ? visualAssetPosterUrl(asset) : asset.media_type === "image" ? visualAssetUrl(asset) : null
          return <Button key={asset.id} type="button" variant="ghost" className="director-reference-item" onClick={() => onAdd(asset)}>
            <span className="director-reference-thumb">{preview ? <img src={preview} alt="" /> : <Icon />}</span>
            <span><strong>{name}</strong><small>{asset.media_type}</small></span>
          </Button>
        })}
        {!visible.length && <p className="director-reference-empty">No compatible Assets are available yet.</p>}
      </div>
    </DialogContent>
  </Dialog>
}
