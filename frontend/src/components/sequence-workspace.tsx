import { Fragment, useState, type RefCallback } from "react"
import { Minimize2 } from "lucide-react"

import { AssetPartCard } from "@/components/asset-part-card"
import type { InsertKind, SequenceActions } from "@/components/sequence-actions"
import { SequenceInsertControl } from "@/components/sequence-insert-control"
import { SequenceSilenceCard } from "@/components/sequence-silence-card"
import { SpeechPartCard } from "@/components/speech-part-card"
import { EmptySequence } from "@/components/state-panel"
import { formatDuration, formatMicroMoney, partDurationMs } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { DurableJob, GenerateResult, ProductionCastRole, ProductionPart, VoiceDirectory } from "@/types/domain"

import "@/components/sequence-workspace.css"

export type SequenceComposerAnchor = {
  partId?: number | null
  beforePartId: string | null
  expanded: boolean
  title: string
  hostRef: RefCallback<HTMLDivElement>
  onCollapse: () => void
}

function ComposerAnchor({ anchor }: { anchor: SequenceComposerAnchor }) {
  if (anchor.expanded) return <div className="sequence-composer-anchor is-expanded"><span><b>{anchor.title}</b><small>Editing here in the Production Workbench</small></span><button type="button" onClick={anchor.onCollapse}><Minimize2 /> Return inline</button></div>
  return <div className="sequence-composer-anchor is-inline"><div ref={anchor.hostRef} className="sequence-composer-inline-host" /></div>
}

export function SequenceWorkspace({ parts, cast, liveJobs, selected, activePartId, playingKey, playerPlaying, previewPlayingPartId, directory, composerAnchor, onSelected, onInsert, onRetryJob, onConfirmJob, onReplaceAsset, actions }: {
  parts: ProductionPart[]
  cast?: ProductionCastRole[]
  liveJobs: Record<string, DurableJob<unknown>>
  selected: Set<number>
  activePartId?: number | null
  playingKey?: string
  playerPlaying: boolean
  previewPlayingPartId?: number | null
  directory: VoiceDirectory
  composerAnchor?: SequenceComposerAnchor | null
  onSelected: (ids: Set<number>) => void
  onInsert: (kind: InsertKind, beforePartId: string | null) => void
  onRetryJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onConfirmJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onReplaceAsset: (part: ProductionPart) => void
  actions: SequenceActions
}) {
  const sourceParts = parts.filter((part) => part.kind !== "stitch")
  const totalDuration = sourceParts.reduce((sum, part) => sum + partDurationMs(part), 0) / 1000
  const totalSpend = sourceParts.reduce((sum, part) => sum + Number(part.spent || 0), 0)
  const [anchor, setAnchor] = useState<number | null>(null)

  function select(index: number, checked: boolean, shift: boolean) {
    const next = new Set(selected)
    if (shift && anchor !== null) {
      const [start = 0, end = 0] = [anchor, index].sort((a, b) => a - b)
      sourceParts.slice(start, end + 1).forEach((part) => checked ? next.add(part.id) : next.delete(part.id))
    } else {
      const part = sourceParts[index]
      if (!part) return
      if (checked) next.add(part.id)
      else next.delete(part.id)
      setAnchor(index)
    }
    onSelected(next)
  }

  if (!sourceParts.length) return <section className="sequence-workspace" aria-label="Production sequence"><EmptySequence onAdd={() => onInsert("speech", null)} />{composerAnchor && <ComposerAnchor anchor={composerAnchor} />}</section>
  return (
    <section className="sequence-workspace" aria-label="Production sequence">
      <div className="sequence-ledger">
        <div className="sequence-ledger-header" aria-hidden="true"><span>#</span><span>Cast &amp; Voice</span><span>Script &amp; Results</span></div>
        <div className="sequence-part-list" role="list" aria-label={`${sourceParts.length} ordered Production Parts`}>
      <SequenceInsertControl at={0} beforePartId={sourceParts[0]?.public_id || null} onInsert={onInsert} />
      {composerAnchor && !composerAnchor.partId && composerAnchor.beforePartId === (sourceParts[0]?.public_id || null) && <ComposerAnchor anchor={composerAnchor} />}
      {sourceParts.map((part, index) => <Fragment key={part.id}>
        <div className={cn("sequence-row", part.kind === "silence" && "silence", !["silence", "asset"].includes(part.kind) && "speech", activePartId === part.id && "is-workbench-active", playerPlaying && previewPlayingPartId === part.id && "is-preview-playing")} data-workbench-active={activePartId === part.id || undefined} data-preview-playing={playerPlaying && previewPlayingPartId === part.id || undefined} role="listitem" aria-posinset={index + 1} aria-setsize={sourceParts.length}>
          <div className="sequence-node-column"><span className={cn("sequence-row-node", part.kind === "asset" && "asset", part.kind === "draft" && "draft", part.missing && "issue")}>{part.kind === "silence" ? "" : String(index + 1).padStart(2, "0")}</span></div>
          {part.kind === "silence"
            ? <SequenceSilenceCard part={part} index={index} count={sourceParts.length} selected={selected.has(part.id)} onSelect={(checked, shift) => select(index, checked, shift)} actions={actions} />
            : part.kind === "asset"
              ? <AssetPartCard part={part} index={index} count={sourceParts.length} selected={selected.has(part.id)} playing={playerPlaying && playingKey === `part:${part.id}`} onSelect={(checked, shift) => select(index, checked, shift)} onReplace={() => onReplaceAsset(part)} actions={actions} />
              : <SpeechPartCard part={part} job={part.speech_job ? (liveJobs[part.speech_job.id] as DurableJob<GenerateResult> | undefined) || part.speech_job : null} captionJob={part.caption_job ? (liveJobs[part.caption_job.id] as typeof part.caption_job | undefined) || part.caption_job : null} castRole={cast?.find((role) => role.id === part.cast_role_id)} index={index} count={sourceParts.length} selected={selected.has(part.id)} playing={playerPlaying && playingKey === `part:${part.id}`} playingPreview={playerPlaying && previewPlayingPartId === part.id} directory={directory} onSelect={(checked, shift) => select(index, checked, shift)} onRetryJob={() => { const job = part.speech_job ? (liveJobs[part.speech_job.id] as DurableJob<GenerateResult> | undefined) || part.speech_job : null; if (job) onRetryJob(part, job) }} onConfirmJob={() => { const job = part.speech_job ? (liveJobs[part.speech_job.id] as DurableJob<GenerateResult> | undefined) || part.speech_job : null; if (job) onConfirmJob(part, job) }} actions={actions} />}
        </div>
        {composerAnchor?.partId === part.id && <ComposerAnchor anchor={composerAnchor} />}
        <SequenceInsertControl at={index + 1} beforePartId={index === sourceParts.length - 1 ? null : sourceParts[index + 1]?.public_id || null} last={index === sourceParts.length - 1} onInsert={onInsert} />
        {composerAnchor && !composerAnchor.partId && index < sourceParts.length - 1 && composerAnchor.beforePartId === (sourceParts[index + 1]?.public_id || null) && <ComposerAnchor anchor={composerAnchor} />}
        {composerAnchor && !composerAnchor.partId && index === sourceParts.length - 1 && composerAnchor.beforePartId === null && <ComposerAnchor anchor={composerAnchor} />}
      </Fragment>)}
        </div>
      </div>
      <footer className="sequence-ledger-summary"><span>Total duration <b>{formatDuration(totalDuration)}</b></span><span>Total spend <b>{formatMicroMoney(totalSpend)}</b></span></footer>
    </section>
  )
}
