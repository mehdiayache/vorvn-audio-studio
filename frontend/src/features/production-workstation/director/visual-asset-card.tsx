import { Clock3, Expand, Image as ImageIcon, LoaderCircle, MoreHorizontal, Plus, X, Video } from "lucide-react"

import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { VentureAsset } from "@/types/domain"
import { visualAssetFacts, visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "./director-assets"
import type { DirectorGalleryView } from "./director-gallery"

export function VisualAssetCard({ asset, mode = "director", view = "gallery", pending = false, addLabel = "Add", onPreview, onAdd, onAddToTimeline, onRemove }: {
  asset: VentureAsset
  mode?: "director" | "library"
  view?: DirectorGalleryView
  pending?: boolean
  addLabel?: string
  onPreview: (asset: VentureAsset) => void
  onAdd?: (asset: VentureAsset) => void
  onAddToTimeline?: (asset: VentureAsset) => void
  onRemove?: (asset: VentureAsset) => void
}) {
  const name = visualAssetName(asset)
  const url = visualAssetUrl(asset)
  const facts = visualAssetFacts(asset)
  const ratio = view === "list" ? "16 / 9" : asset.width && asset.height ? `${asset.width} / ${asset.height}` : "4 / 3"
  const actions = mode === "director" ? <div className="visual-asset-hover-actions">
    <OperatorIconButton label={`Preview ${name}`} detail="Open the full media preview and technical details." side="bottom" variant="secondary" onClick={() => onPreview(asset)}><Expand /></OperatorIconButton>
    {onAddToTimeline && <OperatorIconButton label={`Add ${name} to Timeline`} detail="Places this visual at the current playhead." side="bottom" variant="secondary" busy={pending} busyLabel={`Adding ${name}…`} onClick={() => onAddToTimeline(asset)}><Plus /></OperatorIconButton>}
    <DropdownMenu>
      <OperatorTooltip label={pending ? "Updating visual" : `More actions for ${name}`} side="bottom" disabledTrigger={pending}>
        <DropdownMenuTrigger asChild><Button variant="secondary" size="icon-sm" disabled={pending} aria-label={`Actions for ${name}`}>{pending ? <LoaderCircle className="spin" /> : <MoreHorizontal />}</Button></DropdownMenuTrigger>
      </OperatorTooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => onPreview(asset)}><Expand /> Preview details</DropdownMenuItem>
          {onAddToTimeline && <DropdownMenuItem onSelect={() => onAddToTimeline(asset)}><Plus /> Add to Timeline</DropdownMenuItem>}
        </DropdownMenuGroup>
        {onRemove && <><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem onSelect={() => onRemove(asset)}><X /> Remove from Director…</DropdownMenuItem></DropdownMenuGroup></>}
      </DropdownMenuContent>
    </DropdownMenu>
  </div> : null
  return <article className="visual-asset-card" data-media-type={asset.media_type} data-view={view}>
    <div className="visual-asset-preview" style={{ aspectRatio: ratio }}>
      <button className="visual-asset-preview-target" onClick={() => onPreview(asset)} aria-label={`Preview ${name}`}>
        <img src={asset.media_type === "video" ? visualAssetPosterUrl(asset) : url} alt="" loading="lazy" decoding="async" />
      </button>
      <span className="visual-asset-kind">{asset.media_type === "video" ? <Video /> : <ImageIcon />}{asset.media_type === "video" ? "Video" : "Image"}</span>
      {facts.duration && <span className="visual-asset-duration"><Clock3 />{facts.duration}</span>}
      {actions}
    </div>
    <footer>
      <div><h3 title={name}>{name}</h3><p>{facts.dimensions} · {facts.format}</p></div>
      {mode === "library" && onAdd
        ? <ActionButton size="sm" busy={pending} busyLabel="Adding…" onClick={() => onAdd(asset)}><Plus /> {addLabel}</ActionButton>
        : null}
    </footer>
  </article>
}
