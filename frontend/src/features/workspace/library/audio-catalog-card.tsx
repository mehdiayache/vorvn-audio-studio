import { Check, CircleCheck, Pause, Play, Plus } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { FreesoundMark } from "@/features/sound-scene/audio-identity"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CatalogSound } from "@/types/domain"

import "./audio-catalog-card.css"

function CatalogCardTitle({ title, selected, onSelect }: {
  title: string
  selected?: boolean
  onSelect: () => void
}) {
  const button = <button className="audio-catalog-card-main" type="button" aria-label={`Select ${title}`} aria-pressed={selected} onClick={onSelect}>
    <span className="audio-catalog-card-copy"><b>{title}</b></span>
  </button>
  return <OperatorTooltip label={title} detail="Full catalog result name" side="top">{button}</OperatorTooltip>
}

function CatalogCardTags({ tags }: { tags: string[] }) {
  const visible = tags.slice(0, 2)
  const remaining = tags.slice(2)
  if (!visible.length) return <div className="audio-catalog-card-meta" aria-hidden="true" />
  return <div className="audio-catalog-card-meta">
    {visible.map((tag) => <span key={tag}>{tag}</span>)}
    {remaining.length > 0 && <OperatorTooltip label={`${remaining.length} more tag${remaining.length === 1 ? "" : "s"}`} detail={remaining.join(" · ")} side="bottom"><span className="audio-catalog-card-more-tags" tabIndex={0} aria-label={`${remaining.length} more tags`}>+{remaining.length}</span></OperatorTooltip>}
  </div>
}

export function AudioCatalogCard({ result, selected, playing, kept, busy, onSelect, onPlay, onKeep }: {
  result: CatalogSound
  selected?: boolean
  playing?: boolean
  kept?: boolean
  busy?: boolean
  onSelect: () => void
  onPlay?: () => void
  onKeep: () => void
}) {
  const tags = [...new Set(result.tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))]
  return <article className={cn("audio-catalog-card", selected && "is-selected")}>
    {kept && <OperatorTooltip label="Saved File" detail="This Freesound result is already saved as a reusable File." side="bottom"><span className="audio-catalog-card-saved" tabIndex={0} aria-label="Saved File"><CircleCheck /></span></OperatorTooltip>}
    <header className="audio-catalog-card-identity"><span className="audio-catalog-card-source"><FreesoundMark />Freesound · {result.creator}</span></header>
    <CatalogCardTitle title={result.name} selected={selected} onSelect={onSelect} />
    <CatalogCardTags tags={tags} />
    <div className="audio-catalog-card-actions">
      {result.preview_url && onPlay && <span className="audio-catalog-card-audition"><OperatorIconButton className="audio-catalog-card-play" data-playing={playing || undefined} label={playing ? `Pause ${result.name}` : `Audition ${result.name}`} detail="This is a temporary Freesound preview." size="icon-sm" onClick={onPlay}>{playing ? <Pause /> : <Play />}</OperatorIconButton><small>{formatDuration(result.duration_ms / 1000)}</small></span>}
      <OperatorIconButton className="audio-catalog-card-keep" label={kept ? "Saved File" : busy ? "Saving File…" : "Keep as File"} detail={kept ? "This result is already a reusable File." : "Saves this external result as a reusable File."} side="left" variant="outline" busy={busy} busyLabel="Saving File…" disabled={kept} onClick={onKeep}>{kept ? <Check /> : <Plus />}</OperatorIconButton>
    </div>
  </article>
}
