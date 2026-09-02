import { Check, CircleCheck, Pause, Play, Plus, RefreshCw } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { AudioFamilyBadge, AudioSourceBadge } from "@/features/sound-scene/audio-identity"
import { audioFileCategory, audioUsageTags } from "@/features/sound-scene/audio-presentation"
import { fileProvenance } from "@/lib/file-provenance"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CatalogSound, WorkspaceFile } from "@/types/domain"

import "./audio-file-card.css"

export function audioFileTitle(file: Pick<WorkspaceFile, "name" | "title" | "text">) {
  return file.name || file.title || file.text || "Untitled audio"
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
  const button = <button className="audio-file-card-main" type="button" aria-label={`Select ${title}`} aria-pressed={selected} onClick={onSelect}>
    <span className="audio-file-card-copy"><b ref={titleRef}>{title}</b></span>
  </button>
  return truncated
    ? <OperatorTooltip label={title} detail="Full audio name" side="top">{button}</OperatorTooltip>
    : button
}

function AudioCardTags({ tags }: { tags: string[] }) {
  const visible = tags.slice(0, 2)
  const remaining = tags.slice(2)
  if (!visible.length) return <div className="audio-file-card-meta" aria-hidden="true" />
  return <div className="audio-file-card-meta">
    {visible.map((tag) => <span key={tag}>{tag}</span>)}
    {remaining.length > 0 && <OperatorTooltip label={`${remaining.length} more tag${remaining.length === 1 ? "" : "s"}`} detail={remaining.join(" · ")} side="bottom"><span className="audio-file-card-more-tags" tabIndex={0} aria-label={`${remaining.length} more tags`}>+{remaining.length}</span></OperatorTooltip>}
  </div>
}

export function AudioFileCard({ file, selected, used, playing, actionLabel = "Add to Timeline", actionBusy, onSelect, onPlay, onAction }: {
  file: WorkspaceFile
  selected?: boolean
  used?: boolean
  playing?: boolean
  actionLabel?: string
  actionBusy?: boolean
  onSelect?: () => void
  onPlay?: () => void
  onAction?: () => void
}) {
  const category = audioFileCategory(file)
  const title = audioFileTitle(file)
  const usage = audioUsageTags(file)
  const provenance = fileProvenance(file)
  const replacing = actionLabel.toLocaleLowerCase().includes("replace")
  return <article className={cn("audio-file-card", `is-${category || "unclassified"}`, selected && "is-selected")}>
    {used && <OperatorTooltip label="Used in Timeline" detail="This audio already has a placement in the current Project." side="bottom"><span className="audio-file-card-used" tabIndex={0} aria-label="Used in Timeline"><CircleCheck /></span></OperatorTooltip>}
    <header className="audio-file-card-identity"><AudioSourceBadge source={provenance.source} providerId={provenance.provider} detail={provenance.detail} />{category && <AudioFamilyBadge family={category} />}</header>
    <AudioCardMain title={title} selected={selected} onSelect={onSelect} />
    <AudioCardTags tags={usage} />
    <div className="audio-file-card-actions">
      {file.filename && onPlay && <span className="audio-file-card-audition"><OperatorIconButton className="audio-file-card-play" data-playing={playing || undefined} label={playing ? `Pause ${title}` : `Audition ${title}`} detail="Auditioning does not place this audio." size="icon-sm" onClick={onPlay}>{playing ? <Pause /> : <Play />}</OperatorIconButton><small>{formatDuration(Number(file.duration_ms || 0) / 1000)}</small></span>}
      {onAction && <OperatorIconButton className="audio-file-card-add" label={actionBusy ? "Adding audio…" : actionLabel} detail={replacing ? "Replaces the selected placement while preserving its timing." : "Places this audio on the selected track at the playhead."} side="left" variant="outline" busy={actionBusy} busyLabel="Adding audio…" onClick={onAction}>{replacing ? <RefreshCw /> : <Plus />}</OperatorIconButton>}
    </div>
  </article>
}

export function AudioCatalogCard({ result, selected, playing, kept, busy, onSelect, onPlay, onKeep }: {
  result: CatalogSound; selected?: boolean; playing?: boolean; kept?: boolean; busy?: boolean
  onSelect: () => void; onPlay?: () => void; onKeep: () => void
}) {
  const tags = [...new Set(result.tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))]
  return <article className={cn("audio-file-card", "is-unclassified", selected && "is-selected")}>
    {kept && <OperatorTooltip label="Saved File" detail="This Freesound result is already saved as a reusable File." side="bottom"><span className="audio-file-card-used" tabIndex={0} aria-label="Saved File"><CircleCheck /></span></OperatorTooltip>}
    <header className="audio-file-card-identity"><AudioSourceBadge source="imported" providerId="freesound" detail={`Imported · Freesound · ${result.creator}`} /></header>
    <AudioCardMain title={result.name} selected={selected} onSelect={onSelect} />
    <AudioCardTags tags={tags} />
    <div className="audio-file-card-actions">
      {result.preview_url && onPlay && <span className="audio-file-card-audition"><OperatorIconButton className="audio-file-card-play" data-playing={playing || undefined} label={playing ? `Pause ${result.name}` : `Audition ${result.name}`} detail="This is a temporary Freesound preview." size="icon-sm" onClick={onPlay}>{playing ? <Pause /> : <Play />}</OperatorIconButton><small>{formatDuration(result.duration_ms / 1000)}</small></span>}
      <OperatorIconButton className="audio-file-card-add" label={kept ? "Saved File" : busy ? "Saving File…" : "Keep as File"} detail={kept ? "This result is already a reusable File." : "Saves this external result as a reusable File."} side="left" variant="outline" busy={busy} busyLabel="Saving File…" disabled={kept} onClick={onKeep}>{kept ? <Check /> : <Plus />}</OperatorIconButton>
    </div>
  </article>
}
