import { Check, Clock3, Image as ImageIcon, LoaderCircle, MoreHorizontal, Plus, X, Video } from "lucide-react"

import { ActionButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { VentureAsset } from "@/types/domain"
import { visualAssetFacts, visualAssetName, visualAssetUrl } from "./director-assets"
import type { DirectorGalleryView } from "./director-gallery"

export function VisualAssetCard({ asset, mode = "director", view = "gallery", pending = false, onPreview, onAdd, onAddToTimeline, onRemove }: {
  asset: VentureAsset
  mode?: "director" | "library"
  view?: DirectorGalleryView
  pending?: boolean
  onPreview: (asset: VentureAsset) => void
  onAdd?: (asset: VentureAsset) => void
  onAddToTimeline?: (asset: VentureAsset) => void
  onRemove?: (asset: VentureAsset) => void
}) {
  const name = visualAssetName(asset)
  const url = visualAssetUrl(asset)
  const facts = visualAssetFacts(asset)
  const ratio = view === "list" ? "16 / 9" : asset.width && asset.height ? `${asset.width} / ${asset.height}` : "4 / 3"
  return <article className="visual-asset-card" data-media-type={asset.media_type} data-view={view}>
    <button className="visual-asset-preview" style={{ aspectRatio: ratio }} onClick={() => onPreview(asset)} aria-label={`Preview ${name}`}>
      {asset.media_type === "video" ? <video src={url} muted preload="metadata" playsInline /> : <img src={url} alt="" loading="lazy" />}
      <span className="visual-asset-kind">{asset.media_type === "video" ? <Video /> : <ImageIcon />}{asset.media_type === "video" ? "Video" : "Image"}</span>
      {facts.duration && <span className="visual-asset-duration"><Clock3 />{facts.duration}</span>}
    </button>
    <footer>
      <div><h3 title={name}>{name}</h3><p>{facts.dimensions} · {facts.format}</p></div>
      {mode === "library" && onAdd
        ? <ActionButton size="sm" busy={pending} busyLabel="Adding…" onClick={() => onAdd(asset)}><Plus /> Add</ActionButton>
        : <DropdownMenu>
          <OperatorTooltip label={pending ? "Updating visual" : `Actions for ${name}`} side="left" disabledTrigger={pending}>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Actions for ${name}`}>{pending ? <LoaderCircle className="spin" /> : <MoreHorizontal />}</Button></DropdownMenuTrigger>
          </OperatorTooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => onPreview(asset)}>{asset.media_type === "video" ? <Video /> : <ImageIcon />} Preview</DropdownMenuItem>
              <DropdownMenuItem disabled={asset.media_type !== "image" || !onAddToTimeline} onSelect={() => onAddToTimeline?.(asset)}><Check />{asset.media_type === "image" ? "Add to Timeline" : "Video Timeline · next checkpoint"}</DropdownMenuItem>
            </DropdownMenuGroup>
            {onRemove && <><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem onSelect={() => onRemove(asset)}><X /> Remove from Director…</DropdownMenuItem></DropdownMenuGroup></>}
          </DropdownMenuContent>
        </DropdownMenu>}
    </footer>
  </article>
}
