import { Check, CircleCheck, Pause, Play, Plus, RefreshCw } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { AudioFamilyBadge, AudioSourceBadge } from "@/features/sound-scene/audio-identity"
import { audioAssetFamily, audioUsageTags, type AudioFamily } from "@/features/sound-scene/audio-presentation"
import { assetSource, assetSourceLine } from "@/lib/asset-provenance"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CatalogSound, VentureAsset } from "@/types/domain"

import "./audio-asset-card.css"

export function audioAssetTitle(asset: Pick<VentureAsset, "name" | "title" | "text">) {
  return asset.name || asset.title || asset.text || "Untitled audio"
}

function AudioCardMain({ title, selected, onSelect }: { title: string; selected?: boolean; onSelect?: () => void }) {
  const titleRef = useRef<HTMLElement>(null)
  const [truncated, setTruncated] = useState(false)
  useEffect(() => {
    const measure = () => {
      const element = titleRef.current
      setTruncated(Boolean(element && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)))
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [title])
  const button = <button className="audio-asset-card-main" type="button" aria-label={`Select ${title}`} aria-pressed={selected} onClick={onSelect}>
    <span className="audio-asset-card-copy"><b ref={titleRef}>{title}</b></span>
  </button>
  return truncated
    ? <OperatorTooltip label={title} detail="Full audio name" side="top">{button}</OperatorTooltip>
    : button
}

function AudioCardTags({ tags }: { tags: string[] }) {
  const visible = tags.slice(0, 2)
  const remaining = tags.slice(2)
  if (!visible.length) return <div className="audio-asset-card-meta" aria-hidden="true" />
  return <div className="audio-asset-card-meta">
    {visible.map((tag) => <span key={tag}>{tag}</span>)}
    {remaining.length > 0 && <OperatorTooltip label={`${remaining.length} more tag${remaining.length === 1 ? "" : "s"}`} detail={remaining.join(" · ")} side="bottom"><span className="audio-asset-card-more-tags" tabIndex={0} aria-label={`${remaining.length} more tags`}>+{remaining.length}</span></OperatorTooltip>}
  </div>
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
  const usage = audioUsageTags(asset)
  const source = assetSource(asset)
  const replacing = actionLabel.toLocaleLowerCase().includes("replace")
  return <article className={cn("audio-asset-card", `is-${family}`, selected && "is-selected")}>
    {used && <OperatorTooltip label="Used in Timeline" detail="This audio already has a placement in the current Production." side="bottom"><span className="audio-asset-card-used" tabIndex={0} aria-label="Used in Timeline"><CircleCheck /></span></OperatorTooltip>}
    <header className="audio-asset-card-identity"><AudioFamilyBadge family={family} /><AudioSourceBadge source={source} detail={assetSourceLine(asset)} /></header>
    <AudioCardMain title={title} selected={selected} onSelect={onSelect} />
    <AudioCardTags tags={usage} />
    <div className="audio-asset-card-actions">
      {asset.filename && onPlay && <span className="audio-asset-card-audition"><OperatorIconButton className="audio-asset-card-play" data-playing={playing || undefined} label={playing ? `Pause ${title}` : `Audition ${title}`} detail="Auditioning does not place this audio." size="icon-sm" onClick={onPlay}>{playing ? <Pause /> : <Play />}</OperatorIconButton><small>{formatDuration(Number(asset.duration_ms || 0) / 1000)}</small></span>}
      {onAction && <OperatorIconButton className="audio-asset-card-add" label={actionBusy ? "Adding audio…" : actionLabel} detail={replacing ? "Replaces the selected placement while preserving its timing." : "Places this audio on the selected track at the playhead."} side="left" variant="outline" busy={actionBusy} busyLabel="Adding audio…" onClick={onAction}>{replacing ? <RefreshCw /> : <Plus />}</OperatorIconButton>}
    </div>
  </article>
}

export function AudioCatalogCard({ result, family, selected, playing, kept, busy, onSelect, onPlay, onKeep }: {
  result: CatalogSound; selected?: boolean; playing?: boolean; kept?: boolean; busy?: boolean
  family: AudioFamily
  onSelect: () => void; onPlay?: () => void; onKeep: () => void
}) {
  const tags = [...new Set(result.tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))]
  return <article className={cn("audio-asset-card", `is-${family}`, selected && "is-selected")}>
    {kept && <OperatorTooltip label="In Audio Library" detail="This Freesound result is already saved as a reusable Asset." side="bottom"><span className="audio-asset-card-used" tabIndex={0} aria-label="In Audio Library"><CircleCheck /></span></OperatorTooltip>}
    <header className="audio-asset-card-identity"><AudioFamilyBadge family={family} suggested /><AudioSourceBadge source="freesound" detail={`Freesound · ${result.creator}`} /></header>
    <AudioCardMain title={result.name} selected={selected} onSelect={onSelect} />
    <AudioCardTags tags={tags} />
    <div className="audio-asset-card-actions">
      {result.preview_url && onPlay && <span className="audio-asset-card-audition"><OperatorIconButton className="audio-asset-card-play" data-playing={playing || undefined} label={playing ? `Pause ${result.name}` : `Audition ${result.name}`} detail="This is a temporary Freesound preview." size="icon-sm" onClick={onPlay}>{playing ? <Pause /> : <Play />}</OperatorIconButton><small>{formatDuration(result.duration_ms / 1000)}</small></span>}
      <OperatorIconButton className="audio-asset-card-add" label={kept ? "In Audio Library" : busy ? "Keeping audio…" : "Keep in Audio Library"} detail={kept ? "This result is already a reusable Asset." : "Saves this external result before it can be used in Productions."} side="left" variant="outline" busy={busy} busyLabel="Keeping audio…" disabled={kept} onClick={onKeep}>{kept ? <Check /> : <Plus />}</OperatorIconButton>
    </div>
  </article>
}
