import { Clock3, Image as ImageIcon, Plus, Video } from "lucide-react"

import { ActionButton } from "@/components/operator-action"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { VentureAsset } from "@/types/domain"
import { visualAssetDetails, visualAssetFacts, visualAssetName, visualAssetPlaybackUrl, visualAssetPosterUrl, visualAssetUrl } from "./director-assets"

export function DirectorPreviewDialog({ asset, pending = false, onAddToTimeline, onOpenChange }: { asset: VentureAsset | null; pending?: boolean; onAddToTimeline?: (asset: VentureAsset) => void; onOpenChange: (open: boolean) => void }) {
  if (!asset) return null
  const name = visualAssetName(asset)
  const facts = visualAssetFacts(asset)
  const details = visualAssetDetails(asset)
  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="director-preview-dialog">
      <DialogHeader><DialogTitle>{name}</DialogTitle><DialogDescription>{asset.media_type === "video" ? "Video" : "Image"} · {facts.dimensions} · {facts.format}</DialogDescription></DialogHeader>
      <div className="director-preview-layout">
        <div className="director-preview-media">{asset.media_type === "video" ? <video src={visualAssetPlaybackUrl(asset)} poster={visualAssetPosterUrl(asset)} controls autoPlay playsInline /> : <img src={visualAssetUrl(asset)} alt={name} />}</div>
        <aside className="director-preview-details" aria-label="Media details">
          <div className="director-preview-facts"><span>{asset.media_type === "video" ? <Video /> : <ImageIcon />}{asset.media_type === "video" ? "Video" : "Image"}</span>{facts.duration && <span><Clock3 />{facts.duration}</span>}</div>
          {onAddToTimeline && <ActionButton className="director-preview-add" busy={pending} busyLabel="Adding to Timeline…" onClick={() => onAddToTimeline(asset)}><Plus data-icon="inline-start" /> Add to Timeline</ActionButton>}
          <DetailSection title="Origin" items={details.origin} />
          <DetailSection title="Technical" items={details.technical} />
          {details.library.length > 0 && <DetailSection title="Library" items={details.library} />}
        </aside>
      </div>
    </DialogContent>
  </Dialog>
}

function DetailSection({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  if (!items.length) return null
  return <section className="director-detail-section"><h3>{title}</h3><dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section>
}
