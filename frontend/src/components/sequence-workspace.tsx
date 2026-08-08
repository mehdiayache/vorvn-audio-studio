import { Fragment, useState } from "react"

import type { InsertKind, SequenceActions } from "@/components/sequence-actions"
import { SequenceInsertControl } from "@/components/sequence-insert-control"
import { SequencePartCard } from "@/components/sequence-part-card"
import { PendingPartCard } from "@/components/pending-part-card"
import { SequenceSilenceCard } from "@/components/sequence-silence-card"
import { EmptySequence } from "@/components/state-panel"
import { cn } from "@/lib/utils"
import type { ProductionPart, RenderTask, VoiceDirectory } from "@/types/domain"

import "@/components/sequence-workspace.css"

export function SequenceWorkspace({ parts, renderTasks = [], selected, playingKey, playerPlaying, directory, onSelected, onInsert, onRetryRender, onDismissRender, actions }: {
  parts: ProductionPart[]
  renderTasks?: RenderTask[]
  selected: Set<number>
  playingKey?: string
  playerPlaying: boolean
  directory: VoiceDirectory
  onSelected: (ids: Set<number>) => void
  onInsert: (kind: InsertKind, at: number | null) => void
  onRetryRender: (task: RenderTask) => void
  onDismissRender: (id: string) => void
  actions: SequenceActions
}) {
  const sourceParts = parts.filter((part) => part.kind !== "stitch")
  const newTasks = renderTasks.filter((task) => task.mode === "new")
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

  function insertionIndex(task: RenderTask) {
    if (task.insertAt === null) return sourceParts.length
    const index = sourceParts.findIndex((part, partIndex) => (part.position ?? partIndex) >= Number(task.insertAt))
    return index < 0 ? sourceParts.length : index
  }
  const tasksAt = (index: number) => newTasks.filter((task) => insertionIndex(task) === index)
  const tasksBefore = (index: number) => newTasks.filter((task) => insertionIndex(task) <= index).length

  if (!sourceParts.length && !newTasks.length) return <EmptySequence onAdd={() => onInsert("speech", 0)} />
  return (
    <section className="sequence-workspace" aria-label="Production sequence">
      <header className="sequence-workspace-title"><div><span>Source sequence</span><h2>Production parts</h2></div><p>One ordered narration. Open a part for its full script, takes, and captions.</p></header>
      <div className="sequence-spine" aria-hidden="true" />
      <SequenceInsertControl at={0} insertAt={sourceParts[0]?.position ?? 0} onInsert={onInsert} />
      {tasksAt(0).map((task, taskOffset) => <PendingPartCard task={task} index={taskOffset} directory={directory} onRetry={onRetryRender} onDismiss={onDismissRender} key={task.id} />)}
      {sourceParts.map((part, index) => <Fragment key={part.id}>
        <div className={cn("sequence-row", part.kind === "silence" && "silence")}>
          <div className="sequence-node-column"><span className={cn("sequence-row-node", part.kind === "asset" && "asset", part.kind === "draft" && "draft", part.missing && "issue")}>{part.kind === "silence" ? "" : String(index + tasksBefore(index) + 1).padStart(2, "0")}</span></div>
          {part.kind === "silence"
            ? <SequenceSilenceCard part={part} index={index} selected={selected.has(part.id)} onSelect={(checked, shift) => select(index, checked, shift)} actions={actions} />
            : <SequencePartCard part={part} renderTask={renderTasks.find((task) => task.targetPartId === part.id)} index={index} count={sourceParts.length} selected={selected.has(part.id)} playing={playerPlaying && playingKey === `part:${part.id}`} directory={directory} onSelect={(checked, shift) => select(index, checked, shift)} onRetryRender={onRetryRender} onDismissRender={onDismissRender} actions={actions} />}
        </div>
        {tasksAt(index + 1).map((task, taskOffset) => <PendingPartCard task={task} index={index + tasksBefore(index) + taskOffset + 1} directory={directory} onRetry={onRetryRender} onDismiss={onDismissRender} key={task.id} />)}
        <SequenceInsertControl at={index + 1} insertAt={index === sourceParts.length - 1 ? null : sourceParts[index + 1]?.position ?? index + 1} last={index === sourceParts.length - 1} onInsert={onInsert} />
      </Fragment>)}
    </section>
  )
}
