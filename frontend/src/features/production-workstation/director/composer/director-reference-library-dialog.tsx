import { AudioLines, Film, Image, Search, Upload } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { SavedVisualReference, VentureAsset } from "@/types/domain"
import { visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "../director-assets"
import type { DirectorAttachmentKind } from "./director-composer-config"

function mediaIcon(kind?: string) {
  return kind === "audio" ? AudioLines : kind === "video" ? Film : Image
}

export function DirectorReferenceLibraryDialog({ open, title, assets, savedReferences = [], acceptedMediaTypes, onOpenChange, onAdd, onAddReference, onUpload }: {
  open: boolean
  title?: string
  assets: VentureAsset[]
  savedReferences?: SavedVisualReference[]
  acceptedMediaTypes: DirectorAttachmentKind[]
  onOpenChange: (open: boolean) => void
  onAdd: (asset: VentureAsset) => void
  onAddReference?: (reference: SavedVisualReference) => void
  onUpload?: () => void
}) {
  const [query, setQuery] = useState("")
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return assets.filter((asset) => acceptedMediaTypes.includes(asset.media_type as DirectorAttachmentKind))
      .filter((asset) => !normalized || visualAssetName(asset).toLowerCase().includes(normalized))
  }, [acceptedMediaTypes, assets, query])
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="director-reference-dialog">
      <DialogHeader><DialogTitle>{title ? `Choose ${title.toLowerCase()}` : "Choose a reference"}</DialogTitle><DialogDescription>Only media compatible with this exact input is shown.</DialogDescription></DialogHeader>
      <div className="director-reference-picker-tools">
        <label className="director-library-search"><Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search available media" /></label>
        {onUpload && <Button type="button" variant="outline" onClick={onUpload}><Upload />Upload</Button>}
      </div>
      {savedReferences.length > 0 && <section className="director-saved-reference-list"><header>Saved references</header><div>{savedReferences.map((reference) => <Button key={reference.id} type="button" variant="outline" size="sm" onClick={() => onAddReference?.(reference)}><Image />{reference.name}<small>{reference.asset_ids.length}</small></Button>)}</div></section>}
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
        {!visible.length && <div className="director-reference-empty"><p>No compatible media is available yet.</p>{onUpload && <Button type="button" onClick={onUpload}><Upload />Upload compatible media</Button>}</div>}
      </div>
    </DialogContent>
  </Dialog>
}
