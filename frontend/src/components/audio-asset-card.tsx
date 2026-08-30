import { Check, Pause, Play, Plus } from "lucide-react"
import type { ReactNode } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { SoundMediaIcon, audioAssetFamily, audioUsageTags } from "@/features/sound-scene/audio-presentation"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CatalogSound, VentureAsset } from "@/types/domain"

import "./audio-asset-card.css"

export function audioAssetTitle(asset: Pick<VentureAsset, "name" | "title" | "text">) {
  return asset.name || asset.title || asset.text || "Untitled audio"
}

export function AudioAssetCard({ asset, selected, used, playing, source, actionLabel = "Place", actionBusy, onSelect, onPlay, onAction, footer }: {
  asset: VentureAsset
  selected?: boolean
  used?: boolean
  playing?: boolean
  source?: string
  actionLabel?: string
  actionBusy?: boolean
  onSelect?: () => void
  onPlay?: () => void
  onAction?: () => void
  footer?: ReactNode
}) {
  const family = audioAssetFamily(asset)
  const title = audioAssetTitle(asset)
  const usage = audioUsageTags(asset).slice(0, 2)
  return <article className={cn("audio-asset-card", `is-${family}`, selected && "is-selected")}>
    <button className="audio-asset-card-main" type="button" aria-label={`Select ${title}`} aria-pressed={selected} onClick={onSelect}>
      <span className="audio-asset-card-art"><SoundMediaIcon kind={family} /></span>
      <span className="audio-asset-card-copy">
        <b title={title}>{title}</b>
        <small>{[source, formatDuration(Number(asset.duration_ms || 0) / 1000)].filter(Boolean).join(" · ")}</small>
      </span>
      {selected && <Check className="audio-asset-card-check" />}
    </button>
    <div className="audio-asset-card-meta">
      <span>{family === "sfx" ? "SFX" : family.charAt(0).toUpperCase() + family.slice(1)}</span>
      {usage.map((tag) => <span key={tag}>{tag}</span>)}
      {used && <span className="is-used"><Check />Used</span>}
    </div>
    <div className="audio-asset-card-actions">
      {footer}
      {asset.filename && onPlay && <OperatorIconButton label={playing ? `Pause ${title}` : `Audition ${title}`} detail="Auditioning does not place this audio." size="icon-sm" onClick={onPlay}>{playing ? <Pause /> : <Play />}</OperatorIconButton>}
      {onAction && <Button size="sm" disabled={actionBusy} onClick={onAction}><Plus />{actionBusy ? "Placing…" : actionLabel}</Button>}
    </div>
  </article>
}

export function AudioCatalogCard({ result, selected, playing, kept, busy, onSelect, onPlay, onKeep }: {
  result: CatalogSound; selected?: boolean; playing?: boolean; kept?: boolean; busy?: boolean
  onSelect: () => void; onPlay?: () => void; onKeep: () => void
}) {
  return <article className={cn("audio-asset-card is-sfx", selected && "is-selected")}>
    <button className="audio-asset-card-main" type="button" aria-label={`Select ${result.name}`} aria-pressed={selected} onClick={onSelect}>
      <span className="audio-asset-card-art"><SoundMediaIcon kind="sfx" /></span>
      <span className="audio-asset-card-copy"><b title={result.name}>{result.name}</b><small>{result.creator} · {formatDuration(result.duration_ms / 1000)}</small></span>
      {selected && <Check className="audio-asset-card-check" />}
    </button>
    <div className="audio-asset-card-meta"><span>SFX</span><span>{result.license === "cc0" ? "CC0" : `CC ${result.license.slice(3).toUpperCase()}`}</span><span>{result.original_format.toUpperCase()}</span></div>
    <div className="audio-asset-card-actions">
      {result.preview_url && onPlay && <OperatorIconButton label={playing ? `Pause ${result.name}` : `Audition ${result.name}`} detail="This is a temporary Freesound preview." size="icon-sm" onClick={onPlay}>{playing ? <Pause /> : <Play />}</OperatorIconButton>}
      <Button size="sm" disabled={busy || kept} onClick={onKeep}>{kept ? <><Check />In Library</> : <><Plus />{busy ? "Keeping…" : "Keep"}</>}</Button>
    </div>
  </article>
}
