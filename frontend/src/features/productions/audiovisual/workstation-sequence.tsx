import { useState, type DragEvent, type HTMLAttributes } from "react"
import {
  Captions, Check, CircleAlert, Clock3, Edit3, GripVertical,
  FileAudio, LoaderCircle, Mic2, Minus, MoreHorizontal, Pause, Play, Plus, RotateCw, Search, Sparkles,
} from "lucide-react"

import { InlineDeliveryTags } from "@/components/inline-delivery-tags"
import { AudioWaveform } from "@/components/audio-waveform"
import { AudioDownloadButton } from "@/components/audio-download-button"
import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { VoiceIdentity } from "@/components/voice-identity"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { speechPartCardFacts } from "@/components/speech-part-card-model"
import { cn } from "@/lib/utils"
import { formatAuthoredRole, formatMoney, formatPartNumber, partDurationMs, textDirection } from "@/lib/format"
import { audioUrl } from "@/lib/api"
import { audioFamilyLabel } from "@/features/sound-scene/audio-taxonomy"
import type { DurableJob, GenerateResult, PlayerSource, ProductionPart, VoiceDirectory } from "@/types/domain"
import { WorkstationPaneHeader } from "./workstation-pane-header"

export type WorkstationPartActions = {
  select: (part: ProductionPart) => void
  edit: (part: ProductionPart) => void
  replaceFile: (part: ProductionPart) => void
  play: (source: PlayerSource) => void
  captions: (part: ProductionPart) => void
  duplicate: (part: ProductionPart) => void
  remove: (part: ProductionPart) => void
  move: (part: ProductionPart, direction: -1 | 1) => void
  moveToPosition: (part: ProductionPart) => void
  retry: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  confirm: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  setEnabled: (part: ProductionPart, enabled: boolean) => void
  editSilence: (part: ProductionPart, seconds: number) => void
  addBefore: (part: ProductionPart, kind: SequenceInsertKind) => void
  reorderToPosition: (part: ProductionPart, position: number) => void
  isPending: (part: ProductionPart, action: "enabled" | "duplicate" | "move" | "silence" | "delete" | "replace") => boolean
}

export type SequenceInsertKind = "speech" | "silence" | "file"
type DragHandleProps = HTMLAttributes<HTMLElement> & { draggable?: boolean }

function operationJob(part: ProductionPart, liveJobs: Record<string, DurableJob<unknown>>) {
  if (!part.speech_job) return null
  return (liveJobs[part.speech_job.id] || part.speech_job) as DurableJob<GenerateResult>
}

function captionJob(part: ProductionPart, liveJobs: Record<string, DurableJob<unknown>>) {
  if (!part.caption_job) return null
  return liveJobs[part.caption_job.id] || part.caption_job
}

export type WorkstationPartState = "ready" | "draft" | "issue" | "skipped"

function workstationPartReadiness(part: ProductionPart): Exclude<WorkstationPartState, "skipped"> {
  const failedOperation = Boolean(part.speech_job && ["failed", "lost", "blocked"].includes(part.speech_job.status))
  if (part.outdated || part.missing || part.subtitles_stale || part.binding_resolution_status === "unresolved" || part.kind === "file" && !part.filename || failedOperation) return "issue"
  if (part.kind === "draft" || part.kind === "speech" && !part.clip_id) return "draft"
  return "ready"
}

export function workstationPartState(part: ProductionPart): WorkstationPartState {
  return part.enabled === false ? "skipped" : workstationPartReadiness(part)
}

function partStateLabel(state: WorkstationPartState) {
  if (state === "issue") return "Attention"
  return state.charAt(0).toUpperCase() + state.slice(1)
}

function PartStateIndicator({ state }: { state: WorkstationPartState }) {
  return <span className={cn("ws-part-state", `is-${state}`)}><i />{partStateLabel(state)}</span>
}

function PartInclusionButton({ part, actions, noun = "Part" }: { part: ProductionPart; actions: WorkstationPartActions; noun?: string }) {
  const skipped = part.enabled === false
  const label = skipped ? `Include ${noun}` : `Skip ${noun}`
  const detail = skipped
    ? "Restores it to preview and export using its existing content."
    : "Keeps its content, but removes its duration from preview and export."
  const busy = actions.isPending(part, "enabled")
  return <OperatorTooltip label={busy ? `${skipped ? "Including" : "Skipping"} ${noun}…` : label} detail={detail} disabledTrigger={busy}>
    <ActionButton className="ws-part-inclusion" variant="ghost" size="sm" busy={busy} busyLabel={`${skipped ? "Including" : "Skipping"}…`} aria-label={label} onClick={(event) => { event.stopPropagation(); actions.setEnabled(part, skipped) }}>
      {skipped ? <Plus /> : <Minus />}{skipped ? "Include" : "Skip"}
    </ActionButton>
  </OperatorTooltip>
}

export function WorkstationOutline({ parts, selectedId, playingKey, playerPlaying = false, directory, onSelect, onCollapse }: {
  parts: ProductionPart[]
  selectedId: number | null
  playingKey?: string
  playerPlaying?: boolean
  directory: VoiceDirectory
  onSelect: (part: ProductionPart) => void
  onCollapse: () => void
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "ready" | "drafts" | "issues" | "skipped">("all")
  const visible = parts.filter((part) => {
    const matches = !query || `${part.text} ${part.authored_role || ""} ${part.voice_name || part.voice || ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    if (!matches) return false
    const state = workstationPartState(part)
    if (filter === "ready") return state === "ready"
    if (filter === "drafts") return state === "draft"
    if (filter === "issues") return state === "issue"
    if (filter === "skipped") return state === "skipped"
    return true
  })
  return <div className="ws-outline">
    <WorkstationPaneHeader title="Outline" meta={`${parts.length} parts`} onCollapse={onCollapse} />
    <label className="ws-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a role or line" aria-label="Search Production outline" /></label>
    <div className="ws-filter-row" aria-label="Outline filters">
      {(["all", "ready", "drafts", "issues", "skipped"] as const).map((value) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)}</button>)}
    </div>
    <div className="ws-outline-list">
      {visible.map((part, index) => {
        const state = workstationPartState(part)
        const playing = playerPlaying && playingKey === `part:${part.id}`
        const role = part.kind === "silence" ? "Pause" : part.kind === "file" ? part.title || "Linked audio" : formatAuthoredRole(part.authored_role) || part.voice_name || part.voice || "Speech"
        const readiness = workstationPartReadiness(part)
        const normalDetail = part.kind === "silence" ? `${partDurationMs(part) / 1000}s silence` : part.kind === "file" ? `${audioFamilyLabel(part.file_category || part.file_kind)} · ${Math.round(partDurationMs(part) / 100) / 10}s` : readiness === "draft" ? "Draft · not recorded" : `${Math.round(partDurationMs(part) / 100) / 10}s`
        const detail = state === "skipped" ? `Skipped · ${readiness === "ready" ? "content ready" : readiness === "draft" ? "not recorded" : "needs attention"}` : normalDetail
        return <button key={part.id} className={cn("ws-outline-item", selectedId === part.id && "is-selected", playing && "is-playing", part.enabled === false && "is-disabled")} aria-pressed={selectedId === part.id} aria-current={playing ? "true" : undefined} onClick={() => onSelect(part)}>
          <span className="ws-outline-number">{formatPartNumber(part.position ?? index)}</span>
          <span className="ws-outline-avatar">{part.kind === "silence" ? <Clock3 /> : part.kind === "file" ? <FileAudio /> : <VoiceIdentity voice={part.catalogue_voice_id || part.voice || part.voice_name} identityId={part.voice_identity_id} directory={directory} compact showCopy={false} />}</span>
          <span className="ws-outline-copy"><b>{role}</b><small>{playing ? `Playing · ${detail}` : detail}</small></span>
          <i className={`is-${state}`} aria-label={partStateLabel(state)} />
        </button>
      })}
      {!visible.length && <p className="ws-outline-empty">Nothing matches this view.</p>}
    </div>
  </div>
}

function SequenceDragHandle({ part, index, dragHandleProps, compact = false }: {
  part: ProductionPart
  index: number
  dragHandleProps?: DragHandleProps
  compact?: boolean
}) {
  const label = `Drag Part ${formatPartNumber(part.position ?? index)} to reorder`
  return <button type="button" className={cn("ws-part-index", compact && "is-compact")} aria-label={label} {...dragHandleProps}>
    {!compact && <span>{formatPartNumber(part.position ?? index)}</span>}
    <GripVertical aria-hidden="true" />
  </button>
}

function SilenceCard({ part, index, selected, actions, dragHandleProps }: { part: ProductionPart; index: number; selected: boolean; actions: WorkstationPartActions; dragHandleProps?: DragHandleProps }) {
  const seconds = partDurationMs(part) / 1000
  const state = workstationPartState(part)
  return <article id={`ws-part-${part.id}`} className={cn("ws-silence-card", selected && "is-selected", part.enabled === false && "is-disabled")} onClick={() => actions.select(part)}>
    <SequenceDragHandle part={part} index={index} dragHandleProps={dragHandleProps} compact />
    <span className="ws-silence-line" />
    <div><Clock3 /><b>Pause</b><input aria-label="Silence duration" aria-busy={actions.isPending(part, "silence") || undefined} disabled={actions.isPending(part, "silence")} type="number" min="0.1" step="0.1" defaultValue={seconds} onClick={(event) => event.stopPropagation()} onBlur={(event) => actions.editSilence(part, Number(event.target.value))} />{actions.isPending(part, "silence") ? <span><LoaderCircle className="spin" /> Saving…</span> : <span>seconds</span>}<PartStateIndicator state={state} /></div>
    <PartInclusionButton part={part} actions={actions} noun="Pause" />
    <span className="ws-silence-line" />
  </article>
}

function PartActionsMenu({ part, actions }: { part: ProductionPart; actions: WorkstationPartActions }) {
  const duplicating = actions.isPending(part, "duplicate")
  const moving = actions.isPending(part, "move")
  const deleting = actions.isPending(part, "delete")
  const busy = duplicating || moving || deleting
  return <DropdownMenu><OperatorTooltip label={busy ? "Saving Part change…" : "More Part actions"} detail="Duplicate, move, or permanently delete this Part." disabledTrigger={busy}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={busy} aria-label={busy ? "Saving Part change" : "Part actions"} aria-busy={busy || undefined} onClick={(event) => event.stopPropagation()}>{busy ? <LoaderCircle className="spin" /> : <MoreHorizontal />}</Button></DropdownMenuTrigger></OperatorTooltip><DropdownMenuContent align="end"><DropdownMenuItem disabled={busy} onSelect={() => actions.duplicate(part)}>Duplicate</DropdownMenuItem><DropdownMenuItem disabled={busy} onSelect={() => actions.move(part, -1)}>Move up</DropdownMenuItem><DropdownMenuItem disabled={busy} onSelect={() => actions.move(part, 1)}>Move down</DropdownMenuItem><DropdownMenuItem disabled={busy} onSelect={() => actions.moveToPosition(part)}>Move to position…</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled={busy} variant="destructive" onSelect={() => actions.remove(part)}>Delete part</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
}

function compactFileDuration(part: ProductionPart) {
  const totalTenths = Math.max(0, Math.round(partDurationMs(part) / 100))
  const minutes = Math.floor(totalTenths / 600)
  const seconds = Math.floor((totalTenths % 600) / 10)
  return `${minutes}:${String(seconds).padStart(2, "0")}.${totalTenths % 10}`
}

export function WorkstationFileCard({ part, index, selected, playing, actions, dragHandleProps }: {
  part: ProductionPart
  index: number
  selected: boolean
  playing: boolean
  actions: WorkstationPartActions
  dragHandleProps?: DragHandleProps
}) {
  const state = workstationPartState(part)
  const title = part.title || part.text || "Linked audio"
  const category = audioFamilyLabel(part.file_category || part.file_kind)
  const duration = compactFileDuration(part)
  const playable = Boolean(part.filename && !part.missing)
  const hasIssue = state === "issue"
  const source: PlayerSource = { key: `part:${part.id}`, url: audioUrl(part.filename || ""), title, subtitle: `${category} · Part ${formatPartNumber(part.position ?? index)}`, kind: "file" }
  return <article id={`ws-part-${part.id}`} className={cn("ws-part-card", "ws-file-card", selected && "is-selected", hasIssue && "has-issue", part.enabled === false && "is-disabled")} onClick={() => actions.select(part)}>
    <SequenceDragHandle part={part} index={index} dragHandleProps={dragHandleProps} />
    <div className="ws-part-main ws-file-main">
      <header className="ws-part-identity">
        <div className="ws-file-identity"><span><FileAudio /></span><div><b>{title}</b><small>{category} · Workspace File</small></div></div>
        <div className="ws-part-actions">
          <PartInclusionButton part={part} actions={actions} />
          <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); actions.replaceFile(part) }}><FileAudio /> Replace source</Button>
          <PartActionsMenu part={part} actions={actions} />
        </div>
      </header>
      <footer className="ws-part-footer ws-file-footer">
        {playable ? <OperatorIconButton label={playing ? "Pause linked audio" : "Play linked audio"} variant="ghost" size="icon" className="ws-play" onClick={(event) => { event.stopPropagation(); actions.play(source) }}>{playing ? <Pause /> : <Play />}</OperatorIconButton> : <span className="ws-record-state"><CircleAlert /> Source missing</span>}
        {playable && <AudioDownloadButton url={audioUrl(part.filename || "")} label={`${title} audio`} compact onClick={(event) => event.stopPropagation()} />}
        {playable && <span className={cn("ws-waveform", playing && "is-active")}><AudioWaveform url={audioUrl(part.filename || "")} bars={72} /></span>}
        <span className="ws-duration">{duration}</span>
        <span className="ws-file-source"><FileAudio /> Reusable Workspace audio</span>
        {hasIssue && <span className="ws-card-issue"><CircleAlert /> Review source</span>}
        <PartStateIndicator state={state} />
        <strong>{part.cost > 0 ? formatMoney(part.cost) : "Free · reusable"}</strong>
      </footer>
    </div>
  </article>
}

export function WorkstationSequenceCard({ part, index, selected, playing, liveJobs, directory, actions, dragHandleProps }: {
  part: ProductionPart
  index: number
  selected: boolean
  playing: boolean
  liveJobs: Record<string, DurableJob<unknown>>
  directory: VoiceDirectory
  actions: WorkstationPartActions
  dragHandleProps?: DragHandleProps
}) {
  if (part.kind === "silence") return <SilenceCard part={part} index={index} selected={selected} actions={actions} dragHandleProps={dragHandleProps} />
  if (part.kind === "file") return <WorkstationFileCard part={part} index={index} selected={selected} playing={playing} actions={actions} dragHandleProps={dragHandleProps} />
  const speechJob = operationJob(part, liveJobs)
  const facts = speechPartCardFacts({ part, speechJob, captionJob: captionJob(part, liveJobs), directory })
  const role = formatAuthoredRole(part.authored_role)
  const state = workstationPartState(part)
  const isDraft = state === "draft"
  const hasIssue = state === "issue"
  const source: PlayerSource = { key: `part:${part.id}`, url: audioUrl(part.filename || ""), title: role || facts.selectedVoiceName, subtitle: `Part ${formatPartNumber(part.position ?? index)} · ${facts.durationLabel}`, kind: "clip" }
  return <article id={`ws-part-${part.id}`} className={cn("ws-part-card", selected && "is-selected", isDraft && "is-draft", hasIssue && "has-issue", part.enabled === false && "is-disabled")} onClick={() => actions.select(part)}>
    <SequenceDragHandle part={part} index={index} dragHandleProps={dragHandleProps} />
    <div className="ws-part-main">
      <header className="ws-part-identity">
        <div className="ws-role-voice">
          {role && <span className="ws-role-label">{role}</span>}
          <VoiceIdentity voice={part.catalogue_voice_id || part.voice || part.voice_name} identityId={part.voice_identity_id} directory={directory} compact gender={facts.voice.gender} showDetail={false} showEditorialFlag={false} />
          <span className="ws-method-line">{facts.methodLine}</span>
        </div>
        <div className="ws-part-actions">
          <PartInclusionButton part={part} actions={actions} />
          <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); actions.edit(part) }}><Edit3 /> Edit</Button>
          <PartActionsMenu part={part} actions={actions} />
        </div>
      </header>
      <p className="ws-part-script" dir={textDirection(facts.script)}>{facts.scriptState === "tagged" ? <InlineDeliveryTags text={facts.script} /> : facts.script}</p>
      {facts.operation.kind !== "idle" && <div className={cn("ws-operation", `is-${facts.operation.kind}`)}><Sparkles className={facts.operation.kind === "active" ? "spin" : ""} /><b>{facts.operation.label}</b><span>{facts.operation.detail}</span>{facts.operation.progress !== null && <i style={{ width: `${facts.operation.progress}%` }} />}{speechJob && facts.operation.canConfirm && <Button size="sm" onClick={(event) => { event.stopPropagation(); actions.confirm(part, speechJob) }}>Confirm and continue</Button>}{speechJob && facts.operation.canRetry && <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); actions.retry(part, speechJob) }}><RotateCw /> Retry</Button>}</div>}
      <footer className="ws-part-footer">
        {facts.playable ? <OperatorIconButton label={playing ? "Pause part" : "Play part"} variant="ghost" size="icon" className="ws-play" onClick={(event) => { event.stopPropagation(); actions.play(source) }}>{playing ? <Pause /> : <Play />}</OperatorIconButton> : <span className="ws-record-state"><Mic2 /> Not recorded</span>}
        {facts.playable && part.filename && <AudioDownloadButton url={audioUrl(part.filename)} label={`Part ${formatPartNumber(part.position ?? index)} recording`} compact onClick={(event) => event.stopPropagation()} />}
        {facts.playable && <span className={cn("ws-waveform", playing && "is-active")}><AudioWaveform url={part.filename ? audioUrl(part.filename) : undefined} bars={56} /></span>}
        <span className="ws-duration">{facts.durationLabel}</span>
        <button className={cn("ws-caption-state", `is-${facts.captionTone}`)} onClick={(event) => { event.stopPropagation(); actions.captions(part) }}><Captions /> {facts.captionSummary}</button>
        {facts.inputLabel && <span className="ws-input-state"><Check /> {facts.inputLabel}</span>}
        <PartStateIndicator state={state} />
        <strong>{facts.spendValue}</strong>
      </footer>
    </div>
  </article>
}

function SequenceInsertMenu({ label, className, onSelect }: { label: string; className: string; onSelect: (kind: SequenceInsertKind) => void }) {
  return <DropdownMenu>
    <OperatorTooltip label={label}><DropdownMenuTrigger asChild><button className={className} aria-label={label}><Plus />{className === "ws-add-ending" && <span>Add Part</span>}</button></DropdownMenuTrigger></OperatorTooltip>
    <DropdownMenuContent align="center">
      <DropdownMenuItem onSelect={() => onSelect("speech")}><Mic2 /> Speech</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onSelect("silence")}><Clock3 /> Pause</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onSelect("file")}><FileAudio /> Linked audio</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}

export function WorkstationSequence({ parts, selectedId, playingKey, playerPlaying, liveJobs, directory, actions, onAddEnd }: {
  parts: ProductionPart[]
  selectedId: number | null
  playingKey?: string
  playerPlaying: boolean
  liveJobs: Record<string, DurableJob<unknown>>
  directory: VoiceDirectory
  actions: WorkstationPartActions
  onAddEnd: (kind: SequenceInsertKind) => void
}) {
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const draggedPart = draggedId === null ? null : parts.find((part) => part.id === draggedId) || null

  function autoScroll(event: DragEvent<HTMLElement>) {
    const scroller = event.currentTarget.closest(".ws-center-pane")
    if (!(scroller instanceof HTMLElement)) return
    const bounds = scroller.getBoundingClientRect()
    const edge = 72
    if (event.clientY < bounds.top + edge) scroller.scrollBy({ top: -22 })
    else if (event.clientY > bounds.bottom - edge) scroller.scrollBy({ top: 22 })
  }

  function targetPosition(boundary: number) {
    if (!draggedPart) return null
    const from = parts.findIndex((part) => part.id === draggedPart.id)
    if (from < 0) return null
    const adjusted = boundary > from ? boundary - 1 : boundary
    return adjusted === from ? null : adjusted + 1
  }

  function drop(boundary: number) {
    const position = targetPosition(boundary)
    if (draggedPart && position !== null) actions.reorderToPosition(draggedPart, position)
    setDraggedId(null)
    setDropIndex(null)
  }

  function dragHandleProps(part: ProductionPart): DragHandleProps {
    return {
      draggable: true,
      onDragStart: (event) => {
        event.stopPropagation()
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("text/plain", String(part.id))
        setDraggedId(part.id)
      },
      onDragEnd: () => { setDraggedId(null); setDropIndex(null) },
      onClick: (event) => event.stopPropagation(),
    }
  }

  return <div className="ws-sequence-canvas" aria-label="Production sequence">
    <div className={cn("ws-sequence-list", draggedId !== null && "is-reordering")}>
      {parts.map((part, index) => <div className={cn("ws-sequence-slot", dropIndex === index && targetPosition(index) !== null && "is-drop-target", draggedId === part.id && "is-dragging")} key={part.id}
        onDragEnter={(event) => { if (draggedId !== null) { event.preventDefault(); setDropIndex(index) } }}
        onDragOver={(event) => { if (draggedId !== null) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropIndex(index); autoScroll(event) } }}
        onDrop={(event) => { event.preventDefault(); drop(index) }}>
        <SequenceInsertMenu label={`Add a Part before Part ${index + 1}`} className="ws-insert-control" onSelect={(kind) => actions.addBefore(part, kind)} />
        <WorkstationSequenceCard part={part} index={index} selected={selectedId === part.id} playing={playerPlaying && playingKey === `part:${part.id}`} liveJobs={liveJobs} directory={directory} actions={actions} dragHandleProps={dragHandleProps(part)} />
      </div>)}
      <div className={cn("ws-sequence-end", dropIndex === parts.length && targetPosition(parts.length) !== null && "is-drop-target")}
        onDragEnter={(event) => { if (draggedId !== null) { event.preventDefault(); setDropIndex(parts.length) } }}
        onDragOver={(event) => { if (draggedId !== null) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropIndex(parts.length); autoScroll(event) } }}
        onDrop={(event) => { event.preventDefault(); drop(parts.length) }}>
        <SequenceInsertMenu label="Add a Part at the end" className="ws-add-ending" onSelect={onAddEnd} />
      </div>
    </div>
  </div>
}
