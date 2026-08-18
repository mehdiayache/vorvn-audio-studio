import { useState } from "react"
import {
  Captions, Check, CircleAlert, CircleDot, Clock3, Edit3, GripVertical,
  Mic2, MoreHorizontal, Pause, Play, RotateCw, Search, Sparkles, Volume2, VolumeX,
} from "lucide-react"

import { InlineDeliveryTags } from "@/components/inline-delivery-tags"
import { AudioWaveform } from "@/components/audio-waveform"
import { VoiceIdentity } from "@/components/voice-identity"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { speechPartCardFacts } from "@/components/speech-part-card-model"
import { cn } from "@/lib/utils"
import { formatAuthoredRole, formatPartNumber, partDurationMs, textDirection } from "@/lib/format"
import { audioUrl } from "@/lib/api"
import type { DurableJob, GenerateResult, PlayerSource, ProductionPart, VoiceDirectory } from "@/types/domain"
import { WorkstationPaneHeader } from "./workstation-pane-header"

export type WorkstationPartActions = {
  select: (part: ProductionPart) => void
  edit: (part: ProductionPart) => void
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
  addBefore: (part: ProductionPart) => void
}

function operationJob(part: ProductionPart, liveJobs: Record<string, DurableJob<unknown>>) {
  if (!part.speech_job) return null
  return (liveJobs[part.speech_job.id] || part.speech_job) as DurableJob<GenerateResult>
}

function captionJob(part: ProductionPart, liveJobs: Record<string, DurableJob<unknown>>) {
  if (!part.caption_job) return null
  return liveJobs[part.caption_job.id] || part.caption_job
}

export type WorkstationPartState = "ready" | "draft" | "issue"

export function workstationPartState(part: ProductionPart): WorkstationPartState {
  const failedOperation = Boolean(part.speech_job && ["failed", "lost", "blocked"].includes(part.speech_job.status))
  if (part.outdated || part.missing || part.subtitles_stale || failedOperation) return "issue"
  if (part.kind === "draft" || part.kind === "speech" && !part.clip_id) return "draft"
  return "ready"
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
  const [filter, setFilter] = useState<"all" | "ready" | "drafts" | "issues">("all")
  const visible = parts.filter((part) => {
    const matches = !query || `${part.text} ${part.authored_role || ""} ${part.voice_name || part.voice || ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    if (!matches) return false
    const state = workstationPartState(part)
    if (filter === "ready") return state === "ready"
    if (filter === "drafts") return state === "draft"
    if (filter === "issues") return state === "issue"
    return true
  })
  return <div className="ws-outline">
    <WorkstationPaneHeader title="Outline" meta={`${parts.length} parts`} onCollapse={onCollapse} />
    <label className="ws-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a role or line" aria-label="Search Production outline" /></label>
    <div className="ws-filter-row" aria-label="Outline filters">
      {(["all", "ready", "drafts", "issues"] as const).map((value) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)}</button>)}
    </div>
    <div className="ws-outline-list">
      {visible.map((part, index) => {
        const state = workstationPartState(part)
        const playing = playerPlaying && playingKey === `part:${part.id}`
        const role = part.kind === "silence" ? "Pause" : part.kind === "asset" ? "Linked audio" : formatAuthoredRole(part.authored_role) || part.voice_name || part.voice || "Speech"
        const detail = part.kind === "silence" ? `${partDurationMs(part) / 1000}s silence` : state === "draft" ? "Draft · not recorded" : `${Math.round(partDurationMs(part) / 100) / 10}s`
        return <button key={part.id} className={cn("ws-outline-item", selectedId === part.id && "is-selected", playing && "is-playing", part.enabled === false && "is-disabled")} aria-pressed={selectedId === part.id} aria-current={playing ? "true" : undefined} onClick={() => onSelect(part)}>
          <span className="ws-outline-number">{formatPartNumber(part.position ?? index)}</span>
          <span className="ws-outline-avatar">{part.kind === "silence" ? <Clock3 /> : <VoiceIdentity voice={part.catalogue_voice_id || part.voice || part.voice_name} identityId={part.voice_identity_id} directory={directory} compact showCopy={false} />}</span>
          <span className="ws-outline-copy"><b>{role}</b><small>{playing ? `Playing · ${detail}` : detail}</small></span>
          <i className={`is-${state}`} aria-label={state === "issue" ? "Needs attention" : state === "draft" ? "Draft" : "Ready"} />
        </button>
      })}
      {!visible.length && <p className="ws-outline-empty">Nothing matches this view.</p>}
    </div>
  </div>
}

function SilenceCard({ part, selected, actions }: { part: ProductionPart; selected: boolean; actions: WorkstationPartActions }) {
  const seconds = partDurationMs(part) / 1000
  return <article id={`ws-part-${part.id}`} className={cn("ws-silence-card", selected && "is-selected", part.enabled === false && "is-disabled")} onClick={() => actions.select(part)}>
    <span className="ws-silence-line" />
    <div><Clock3 /><b>Pause</b><input aria-label="Silence duration" type="number" min="0.1" step="0.1" defaultValue={seconds} onClick={(event) => event.stopPropagation()} onBlur={(event) => actions.editSilence(part, Number(event.target.value))} /><span>seconds</span></div>
    <Button variant="ghost" size="icon-sm" aria-label={part.enabled === false ? "Include silence" : "Exclude silence"} onClick={(event) => { event.stopPropagation(); actions.setEnabled(part, part.enabled === false) }}>{part.enabled === false ? <Volume2 /> : <VolumeX />}</Button>
    <span className="ws-silence-line" />
  </article>
}

export function WorkstationSequenceCard({ part, index, selected, playing, liveJobs, directory, actions }: {
  part: ProductionPart
  index: number
  selected: boolean
  playing: boolean
  liveJobs: Record<string, DurableJob<unknown>>
  directory: VoiceDirectory
  actions: WorkstationPartActions
}) {
  if (part.kind === "silence") return <SilenceCard part={part} selected={selected} actions={actions} />
  const speechJob = operationJob(part, liveJobs)
  const facts = speechPartCardFacts({ part, speechJob, captionJob: captionJob(part, liveJobs), directory })
  const role = formatAuthoredRole(part.authored_role)
  const isDraft = !facts.recorded
  const hasIssue = facts.alerts.some((alert) => alert.tone !== "neutral") || facts.operation.kind === "failed"
  const source: PlayerSource = { key: `part:${part.id}`, url: audioUrl(part.filename || ""), title: role || facts.selectedVoiceName, subtitle: `Part ${formatPartNumber(part.position ?? index)} · ${facts.durationLabel}`, kind: "clip" }
  return <article id={`ws-part-${part.id}`} className={cn("ws-part-card", selected && "is-selected", isDraft && "is-draft", hasIssue && "has-issue", part.enabled === false && "is-disabled")} onClick={() => actions.select(part)}>
    <aside className="ws-part-index"><span>{formatPartNumber(part.position ?? index)}</span><GripVertical aria-hidden="true" /></aside>
    <div className="ws-part-main">
      <header className="ws-part-identity">
        <div className="ws-role-voice">
          {role && <span className="ws-role-label">{role}</span>}
          <VoiceIdentity voice={part.catalogue_voice_id || part.voice || part.voice_name} identityId={part.voice_identity_id} directory={directory} compact gender={facts.voice.gender} showDetail={false} showEditorialFlag={false} />
          <span className="ws-method-line">{facts.methodLine}</span>
        </div>
        <div className="ws-part-actions">
          <Button variant="ghost" size="icon-sm" aria-label={part.enabled === false ? "Include part in output" : "Exclude part from output"} onClick={(event) => { event.stopPropagation(); actions.setEnabled(part, part.enabled === false) }}>{part.enabled === false ? <Volume2 /> : <VolumeX />}</Button>
          <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); actions.edit(part) }}><Edit3 /> Edit</Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Part actions" onClick={(event) => event.stopPropagation()}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => actions.duplicate(part)}>Duplicate</DropdownMenuItem><DropdownMenuItem onSelect={() => actions.move(part, -1)}>Move up</DropdownMenuItem><DropdownMenuItem onSelect={() => actions.move(part, 1)}>Move down</DropdownMenuItem><DropdownMenuItem onSelect={() => actions.moveToPosition(part)}>Move to position…</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => actions.remove(part)}>Delete part</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
      </header>
      <p className="ws-part-script" dir={textDirection(facts.script)}>{facts.scriptState === "tagged" ? <InlineDeliveryTags text={facts.script} /> : facts.script}</p>
      {facts.operation.kind !== "idle" && <div className={cn("ws-operation", `is-${facts.operation.kind}`)}><Sparkles className={facts.operation.kind === "active" ? "spin" : ""} /><b>{facts.operation.label}</b><span>{facts.operation.detail}</span>{facts.operation.progress !== null && <i style={{ width: `${facts.operation.progress}%` }} />}{speechJob && facts.operation.canConfirm && <Button size="sm" onClick={(event) => { event.stopPropagation(); actions.confirm(part, speechJob) }}>Confirm and continue</Button>}{speechJob && facts.operation.canRetry && <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); actions.retry(part, speechJob) }}><RotateCw /> Retry</Button>}</div>}
      <footer className="ws-part-footer">
        {facts.playable ? <Button variant="ghost" size="icon" className="ws-play" aria-label={playing ? "Pause part" : "Play part"} onClick={(event) => { event.stopPropagation(); actions.play(source) }}>{playing ? <Pause /> : <Play />}</Button> : <span className="ws-record-state"><Mic2 /> Not recorded</span>}
        {facts.playable && <span className={cn("ws-waveform", playing && "is-active")}><AudioWaveform url={part.filename ? audioUrl(part.filename) : undefined} bars={56} /></span>}
        <span className="ws-duration">{facts.durationLabel}</span>
        <button className={cn("ws-caption-state", `is-${facts.captionTone}`)} onClick={(event) => { event.stopPropagation(); actions.captions(part) }}><Captions /> {facts.captionSummary}</button>
        {facts.inputLabel && <span className="ws-input-state"><Check /> {facts.inputLabel}</span>}
        {hasIssue && <span className="ws-card-issue"><CircleAlert /> Review</span>}
        {!hasIssue && facts.recorded && <span className="ws-card-ready"><CircleDot /> Ready</span>}
        <strong>{facts.spendValue}</strong>
      </footer>
    </div>
  </article>
}

export function WorkstationSequence({ parts, selectedId, playingKey, playerPlaying, liveJobs, directory, actions, onAddEnd }: {
  parts: ProductionPart[]
  selectedId: number | null
  playingKey?: string
  playerPlaying: boolean
  liveJobs: Record<string, DurableJob<unknown>>
  directory: VoiceDirectory
  actions: WorkstationPartActions
  onAddEnd: () => void
}) {
  return <div className="ws-sequence-canvas" aria-label="Production sequence">
    <div className="ws-sequence-list">
      {parts.map((part, index) => <div className="ws-sequence-slot" key={part.id}>
        <button className="ws-insert-control" aria-label={`Add before part ${index + 1}`} onClick={() => actions.addBefore(part)}>+</button>
        <WorkstationSequenceCard part={part} index={index} selected={selectedId === part.id} playing={playerPlaying && playingKey === `part:${part.id}`} liveJobs={liveJobs} directory={directory} actions={actions} />
      </div>)}
      <button className="ws-add-ending" onClick={onAddEnd}>+ Add the next part</button>
    </div>
  </div>
}
