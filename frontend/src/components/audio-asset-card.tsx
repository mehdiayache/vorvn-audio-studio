import { Check, CircleCheck, Pause, Play, Plus } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { AUDIO_FAMILY_LABELS, SoundMediaIcon, audioAssetFamily, audioUsageTags } from "@/features/sound-scene/audio-presentation"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CatalogSound, VentureAsset } from "@/types/domain"

import "./audio-asset-card.css"

export function audioAssetTitle(asset: Pick<VentureAsset, "name" | "title" | "text">) {
  return asset.name || asset.title || asset.text || "Untitled audio"
}

export function AudioAssetCard({ asset, selected, used, playing, actionLabel = "Add to Timeline", actionBusy, onSelect, onPlay, onAction }: {
  asset: VentureAsset
  selected?: boolean
  used?: boolean
  playing?: boolean
  actionLabel?: string
  actionBusy?: boolean
  onSelect?: () => void
  onPlay?: () => void
  onAction?: () => void
}) {
  const family = audioAssetFamily(asset)
  const title = audioAssetTitle(asset)
  const usage = audioUsageTags(asset).slice(0, 2)
  return <article className={cn("audio-asset-card", `is-${family}`, selected && "is-selected")}>
    {used && <OperatorTooltip label="Used in Timeline" detail="This audio already has a placement in the current Production." side="bottom"><span className="audio-asset-card-used" tabIndex={0} aria-label="Used in Timeline"><CircleCheck /></span></OperatorTooltip>}
    <button className="audio-asset-card-main" type="button" aria-label={`Select ${title}`} aria-pressed={selected} onClick={onSelect}>
      <span className="audio-asset-card-art"><SoundMediaIcon kind={family} /></span>
      <span className="audio-asset-card-copy">
        <b title={title}>{title}</b>
      </span>
    </button>
    <div className="audio-asset-card-meta">
      <span>{AUDIO_FAMILY_LABELS[family]}</span>
      {usage.map((tag) => <span key={tag}>{tag}</span>)}
    </div>
    <div className="audio-asset-card-actions">
      {asset.filename && onPlay && <span className="audio-asset-card-audition"><OperatorIconButton label={playing ? `Pause ${title}` : `Audition ${title}`} detail="Auditioning does not place this audio." size="icon-sm" onClick={onPlay}>{playing ? <Pause /> : <Play />}</OperatorIconButton><small>{formatDuration(Number(asset.duration_ms || 0) / 1000)}</small></span>}
      {onAction && <Button className="audio-asset-card-primary-action" variant="ghost" size="sm" disabled={actionBusy} onClick={onAction}><Plus />{actionBusy ? "Adding…" : actionLabel}</Button>}
    </div>
  </article>
}

export function AudioCatalogCard({ result, selected, playing, kept, busy, onSelect, onPlay, onKeep }: {
  result: CatalogSound; selected?: boolean; playing?: boolean; kept?: boolean; busy?: boolean
  onSelect: () => void; onPlay?: () => void; onKeep: () => void
}) {
  return <article className={cn("audio-asset-card is-sfx", selected && "is-selected")}>
    {kept && <OperatorTooltip label="In Audio Library" detail="This Freesound result is already saved as a reusable Asset." side="bottom"><span className="audio-asset-card-used" tabIndex={0} aria-label="In Audio Library"><CircleCheck /></span></OperatorTooltip>}
    <button className="audio-asset-card-main" type="button" aria-label={`Select ${result.name}`} aria-pressed={selected} onClick={onSelect}>
      <span className="audio-asset-card-art"><SoundMediaIcon kind="sfx" /></span>
      <span className="audio-asset-card-copy"><b title={result.name}>{result.name}</b><small>{result.creator} · {formatDuration(result.duration_ms / 1000)}</small></span>
    </button>
    <div className="audio-asset-card-meta"><span>SFX</span><span>{result.license === "cc0" ? "CC0" : `CC ${result.license.slice(3).toUpperCase()}`}</span><span>{result.original_format.toUpperCase()}</span></div>
    <div className="audio-asset-card-actions">
      {result.preview_url && onPlay && <span className="audio-asset-card-audition"><OperatorIconButton label={playing ? `Pause ${result.name}` : `Audition ${result.name}`} detail="This is a temporary Freesound preview." size="icon-sm" onClick={onPlay}>{playing ? <Pause /> : <Play />}</OperatorIconButton><small>{formatDuration(result.duration_ms / 1000)}</small></span>}
      <Button className="audio-asset-card-primary-action" variant="ghost" size="sm" disabled={busy || kept} onClick={onKeep}>{kept ? <><Check />In Library</> : <><Plus />{busy ? "Keeping…" : "Keep"}</>}</Button>
    </div>
  </article>
}
