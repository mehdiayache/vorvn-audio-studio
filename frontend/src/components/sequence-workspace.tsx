import { Fragment } from "react"

import { AssetPartCard } from "@/components/asset-part-card"
import type { InsertKind, SequenceActions } from "@/components/sequence-actions"
import { SequenceInsertControl } from "@/components/sequence-insert-control"
import { SequenceSilenceCard } from "@/components/sequence-silence-card"
import { SpeechPartCard } from "@/components/speech-part-card"
import { EmptySequence } from "@/components/state-panel"
import { Button } from "@/components/ui/button"
import { formatDuration, formatMicroMoney, partDurationMs } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { DurableJob, GenerateResult, ProductionCastRole, ProductionPart, VoiceDirectory } from "@/types/domain"

import "@/components/sequence-workspace.css"

export function SequenceWorkspace({ parts, cast, liveJobs, visiblePartIds, filtersActive = false, activePartId, playingKey, playerPlaying, previewPlayingPartId, directory, onClearFilters, onInsert, onRetryJob, onConfirmJob, onReplaceAsset, actions }: {
  parts: ProductionPart[]
  cast?: ProductionCastRole[]
  liveJobs: Record<string, DurableJob<unknown>>
  visiblePartIds?: Set<number>
  filtersActive?: boolean
  activePartId?: number | null
  playingKey?: string
  playerPlaying: boolean
  previewPlayingPartId?: number | null
  directory: VoiceDirectory
  onClearFilters?: () => void
  onInsert: (kind: InsertKind, beforePartId: string | null) => void
  onRetryJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onConfirmJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onReplaceAsset: (part: ProductionPart) => void
  actions: SequenceActions
}) {
  const sourceParts = parts.filter((part) => part.kind !== "stitch")
  const totalDuration = sourceParts.filter((part) => part.enabled !== false).reduce((sum, part) => sum + partDurationMs(part), 0) / 1000
  const totalSpend = sourceParts.reduce((sum, part) => sum + Number(part.spent || 0), 0)
  const visibleParts = visiblePartIds ? sourceParts.filter((part) => visiblePartIds.has(part.id)) : sourceParts
  if (!sourceParts.length) return <section className="sequence-workspace" aria-label="Production sequence"><EmptySequence onAdd={() => onInsert("speech", null)} /></section>
  if (!visibleParts.length) return <section className="sequence-workspace" aria-label="Production sequence"><div className="sequence-filter-empty"><b>No Parts match this view</b><p>Clear the active search and filters to return to the complete Sequence.</p><Button type="button" variant="outline" onClick={onClearFilters}>Clear filters</Button></div></section>
  return (
    <section className="sequence-workspace" aria-label="Production sequence">
      <div className="sequence-ledger">
        <div className="sequence-ledger-header" aria-hidden="true"><span>#</span><span>Cast &amp; Voice</span><span>Script &amp; Results</span></div>
        <div className="sequence-part-list" role="list" aria-label={filtersActive ? `${visibleParts.length} of ${sourceParts.length} ordered Production Parts` : `${sourceParts.length} ordered Production Parts`}>
      {!filtersActive && <SequenceInsertControl at={0} beforePartId={sourceParts[0]?.public_id || null} onInsert={onInsert} />}
      {visibleParts.map((part) => {
        const index = sourceParts.findIndex((item) => item.id === part.id)
        return <Fragment key={part.id}>
        <div className={cn("sequence-row", part.kind === "silence" && "silence", !["silence", "asset"].includes(part.kind) && "speech", part.enabled === false && "is-disabled", activePartId === part.id && "is-stage-active", playerPlaying && previewPlayingPartId === part.id && "is-preview-playing")} data-stage-active={activePartId === part.id || undefined} data-preview-playing={playerPlaying && previewPlayingPartId === part.id || undefined} role="listitem" aria-posinset={index + 1} aria-setsize={sourceParts.length}>
          <div className="sequence-node-column"><span className={cn("sequence-row-node", part.kind === "asset" && "asset", part.kind === "draft" && "draft", part.missing && "issue")}>{part.kind === "silence" ? "" : String(index + 1).padStart(2, "0")}</span></div>
          {part.kind === "silence"
            ? <SequenceSilenceCard part={part} index={index} count={sourceParts.length} actions={actions} />
            : part.kind === "asset"
              ? <AssetPartCard part={part} index={index} count={sourceParts.length} playing={playerPlaying && playingKey === `part:${part.id}`} onReplace={() => onReplaceAsset(part)} actions={actions} />
              : <SpeechPartCard part={part} job={part.speech_job ? (liveJobs[part.speech_job.id] as DurableJob<GenerateResult> | undefined) || part.speech_job : null} captionJob={part.caption_job ? (liveJobs[part.caption_job.id] as typeof part.caption_job | undefined) || part.caption_job : null} castRole={cast?.find((role) => role.id === part.cast_role_id)} index={index} count={sourceParts.length} playing={playerPlaying && playingKey === `part:${part.id}`} playingPreview={playerPlaying && previewPlayingPartId === part.id} directory={directory} onRetryJob={() => { const job = part.speech_job ? (liveJobs[part.speech_job.id] as DurableJob<GenerateResult> | undefined) || part.speech_job : null; if (job) onRetryJob(part, job) }} onConfirmJob={() => { const job = part.speech_job ? (liveJobs[part.speech_job.id] as DurableJob<GenerateResult> | undefined) || part.speech_job : null; if (job) onConfirmJob(part, job) }} actions={actions} />}
        </div>
        {!filtersActive && <SequenceInsertControl at={index + 1} beforePartId={index === sourceParts.length - 1 ? null : sourceParts[index + 1]?.public_id || null} last={index === sourceParts.length - 1} onInsert={onInsert} />}
      </Fragment>})}
        </div>
      </div>
      <footer className="sequence-ledger-summary"><span>Total duration <b>{formatDuration(totalDuration)}</b></span><span>Total spend <b>{formatMicroMoney(totalSpend)}</b></span></footer>
    </section>
  )
}
