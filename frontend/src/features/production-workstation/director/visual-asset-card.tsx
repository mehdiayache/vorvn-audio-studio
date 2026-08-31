import { Archive, CircleCheck, Clock3, CloudDownload, Expand, Image as ImageIcon, LoaderCircle, MoreHorizontal, Plus, Sparkles, Upload, X, Video } from "lucide-react"

import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { assetMetadata, assetSource } from "@/lib/asset-provenance"
import type { VentureAsset } from "@/types/domain"
import { visualAssetFacts, visualAssetName, visualAssetPlaybackUrl, visualAssetPosterUrl, visualAssetUrl } from "./director-assets"

export function VisualAssetCard({ asset, mode = "director", pending = false, addLabel = "Add", usedCount = 0, onPreview, onAdd, onAddToTimeline, onRemove }: {
  asset: VentureAsset
  mode?: "director" | "library"
  pending?: boolean
  addLabel?: string
  usedCount?: number
  onPreview: (asset: VentureAsset) => void
  onAdd?: (asset: VentureAsset) => void
  onAddToTimeline?: (asset: VentureAsset) => void
  onRemove?: (asset: VentureAsset) => void
}) {
  const name = visualAssetName(asset)
  const url = visualAssetUrl(asset)
  const facts = visualAssetFacts(asset)
  const ratio = asset.width && asset.height ? `${asset.width} / ${asset.height}` : "4 / 3"
  const source = assetSource(asset)
  const metadata = assetMetadata(asset)
  const generated = source === "generated"
  const provider = String(metadata.provider_id || metadata.provider || "AI")
  const model = String(metadata.provider_model_id || metadata.model || "generated visual")
  const sourceLabel = generated ? "Generated with AI" : source === "freesound" ? "Freesound source" : source === "uploaded" ? "Uploaded media" : "Existing Asset"
  const sourceDetail = generated ? `${provider} · ${model}` : source === "freesound" ? "Saved from Freesound as a reusable Asset." : source === "uploaded" ? "Uploaded to Venture or Studio Assets." : "Already available as a reusable Asset."
  const actionButtons = mode === "director" ? <>
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
  </> : null
  return <article className="visual-asset-card" data-media-type={asset.media_type}>
    <div className="visual-asset-preview" style={{ aspectRatio: ratio }}>
      <button className="visual-asset-preview-target" onClick={() => onPreview(asset)} aria-label={`Preview ${name}`}>
        {asset.media_type === "video"
          ? <video src={visualAssetPlaybackUrl(asset)} poster={visualAssetPosterUrl(asset)} muted playsInline loop preload="metadata" onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)} onMouseLeave={(event) => { event.currentTarget.pause(); event.currentTarget.currentTime = 0 }} />
          : <img src={url} alt="" loading="lazy" decoding="async" />}
      </button>
      <span className="visual-asset-kind">{asset.media_type === "video" ? <Video /> : <ImageIcon />}{asset.media_type === "video" ? "Video" : "Image"}</span>
      {facts.duration && <span className="visual-asset-duration"><Clock3 />{facts.duration}</span>}
      <OperatorTooltip label={sourceLabel} detail={sourceDetail} side="bottom"><span className={`visual-asset-origin${generated ? " is-ai" : ""}`} tabIndex={0}>{generated ? <Sparkles /> : source === "freesound" ? <CloudDownload /> : source === "uploaded" ? <Upload /> : <Archive />}{generated ? "AI" : source === "freesound" ? "Freesound" : source === "uploaded" ? "Upload" : "Asset"}</span></OperatorTooltip>
      {usedCount > 0 && <OperatorTooltip label="Used in Timeline" detail={usedCount === 1 ? "This media has one Timeline placement." : `This media has ${usedCount} Timeline placements.`} side="bottom"><span className="visual-asset-used" tabIndex={0}><CircleCheck /></span></OperatorTooltip>}
      {actionButtons && <div className="visual-asset-hover-actions">{actionButtons}</div>}
    </div>
    {mode === "library" && <footer>
      <div><h3 title={name}>{name}</h3><p>{facts.dimensions} · {facts.format}</p></div>
      {onAdd
        ? <ActionButton size="sm" busy={pending} busyLabel="Adding…" onClick={() => onAdd(asset)}><Plus /> {addLabel}</ActionButton>
        : null}
    </footer>}
  </article>
}
