import { Clock3, Image as ImageIcon, Video } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { VentureAsset } from "@/types/domain"
import { visualAssetFacts, visualAssetName, visualAssetUrl } from "./director-assets"

export function DirectorPreviewDialog({ asset, onOpenChange }: { asset: VentureAsset | null; onOpenChange: (open: boolean) => void }) {
  if (!asset) return null
  const name = visualAssetName(asset)
  const facts = visualAssetFacts(asset)
  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="director-preview-dialog">
      <DialogHeader><DialogTitle>{name}</DialogTitle><DialogDescription>{asset.media_type === "video" ? "Video" : "Image"} · {facts.dimensions} · {facts.format}</DialogDescription></DialogHeader>
      <div className="director-preview-media">{asset.media_type === "video" ? <video src={visualAssetUrl(asset)} controls autoPlay playsInline /> : <img src={visualAssetUrl(asset)} alt={name} />}</div>
      <div className="director-preview-facts"><span>{asset.media_type === "video" ? <Video /> : <ImageIcon />}{asset.media_type === "video" ? "Video" : "Image"}</span>{facts.duration && <span><Clock3 />{facts.duration}</span>}</div>
    </DialogContent>
  </Dialog>
}
