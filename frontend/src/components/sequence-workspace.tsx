import { Fragment, useState } from "react"

import { AssetPartCard } from "@/components/asset-part-card"
import type { InsertKind, SequenceActions } from "@/components/sequence-actions"
import { SequenceInsertControl } from "@/components/sequence-insert-control"
import { SequenceSilenceCard } from "@/components/sequence-silence-card"
import { SpeechPartCard } from "@/components/speech-part-card"
import { EmptySequence } from "@/components/state-panel"
import { cn } from "@/lib/utils"
import type { DurableJob, GenerateResult, ProductionPart, VoiceDirectory } from "@/types/domain"

import "@/components/sequence-workspace.css"

export function SequenceWorkspace({ parts, liveJobs, selected, playingKey, playerPlaying, directory, onSelected, onInsert, onRetryJob, onConfirmJob, onReplaceAsset, actions }: {
  parts: ProductionPart[]
  liveJobs: Record<string, DurableJob<GenerateResult>>
  selected: Set<number>
  playingKey?: string
  playerPlaying: boolean
  directory: VoiceDirectory
  onSelected: (ids: Set<number>) => void
  onInsert: (kind: InsertKind, beforePartId: string | null) => void
  onRetryJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onConfirmJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onReplaceAsset: (part: ProductionPart) => void
  actions: SequenceActions
}) {
  const sourceParts = parts.filter((part) => part.kind !== "stitch")
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

  if (!sourceParts.length) return <EmptySequence onAdd={() => onInsert("speech", null)} />
  return (
    <section className="sequence-workspace" aria-label="Production sequence">
      <header className="sequence-workspace-title"><div><span>Source sequence</span><h2>Production parts</h2></div><p>One ordered narration. Open a part for its full script, takes, and captions.</p></header>
      <div className="sequence-spine" aria-hidden="true" />
      <SequenceInsertControl at={0} beforePartId={sourceParts[0]?.public_id || null} onInsert={onInsert} />
      {sourceParts.map((part, index) => <Fragment key={part.id}>
        <div className={cn("sequence-row", part.kind === "silence" && "silence")}>
          <div className="sequence-node-column"><span className={cn("sequence-row-node", part.kind === "asset" && "asset", part.kind === "draft" && "draft", part.missing && "issue")}>{part.kind === "silence" ? "" : String(index + 1).padStart(2, "0")}</span></div>
          {part.kind === "silence"
            ? <SequenceSilenceCard part={part} index={index} count={sourceParts.length} selected={selected.has(part.id)} onSelect={(checked, shift) => select(index, checked, shift)} actions={actions} />
            : part.kind === "asset"
              ? <AssetPartCard part={part} index={index} count={sourceParts.length} selected={selected.has(part.id)} playing={playerPlaying && playingKey === `part:${part.id}`} onSelect={(checked, shift) => select(index, checked, shift)} onReplace={() => onReplaceAsset(part)} actions={actions} />
              : <SpeechPartCard part={part} job={part.speech_job ? liveJobs[part.speech_job.id] || part.speech_job : null} index={index} count={sourceParts.length} selected={selected.has(part.id)} playing={playerPlaying && playingKey === `part:${part.id}`} directory={directory} onSelect={(checked, shift) => select(index, checked, shift)} onRetryJob={() => { const job = part.speech_job ? liveJobs[part.speech_job.id] || part.speech_job : null; if (job) onRetryJob(part, job) }} onConfirmJob={() => { const job = part.speech_job ? liveJobs[part.speech_job.id] || part.speech_job : null; if (job) onConfirmJob(part, job) }} actions={actions} />}
        </div>
        <SequenceInsertControl at={index + 1} beforePartId={index === sourceParts.length - 1 ? null : sourceParts[index + 1]?.public_id || null} last={index === sourceParts.length - 1} onInsert={onInsert} />
      </Fragment>)}
    </section>
  )
}
