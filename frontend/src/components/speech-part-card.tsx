import { Captions, ChevronDown, ChevronUp, CircleAlert, Copy, LoaderCircle, Mic2, MoreHorizontal, Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react"

import type { SequenceActions } from "@/components/sequence-actions"
import { VoiceIdentity } from "@/components/voice-identity"
import { SpeechRouteLabel } from "@/components/speech-route-label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { audioUrl } from "@/lib/api"
import { clipText, formatDuration, formatMoney, partDurationMs, textDirection } from "@/lib/format"
import { cn } from "@/lib/utils"
import { resolveVoice } from "@/lib/voice"
import type { DurableJob, GenerateResult, ProductionPart, VoiceDirectory } from "@/types/domain"

function SpeechOperation({ job, onRetry, onConfirm }: {
  job: (DurableJob<GenerateResult> & { request?: unknown }) | null
  onRetry: () => void
  onConfirm: () => void
}) {
  if (!job || ["ok", "warning"].includes(job.status)) return null
  const working = ["queued", "running", "retrying"].includes(job.status)
  const blocked = job.status === "blocked"
  const confirmation = blocked && Boolean(job.result?.needs_confirmation) && !Boolean(job.result?.requires_review || job.result?.ambiguous)
  const ambiguous = Boolean(job.result?.ambiguous)
  const failed = ["failed", "lost", "cancelled"].includes(job.status)
  const title = working ? "Generating audio…"
    : confirmation ? "Cost confirmation needed"
      : ambiguous ? "Ambiguous result — review before retry"
        : blocked ? "Provider review required"
          : "Generation failed"
  return <div className={cn("part-operation-state", working && "working", (blocked || failed) && "attention")} role="status" aria-live="polite">
    {working ? <LoaderCircle className="spin" /> : <CircleAlert />}
    <span><b>{title}</b><small>{job.error || job.detail || (working ? "You can close the Composer or leave this page." : "Open Activity for the complete operation record.")}</small></span>
    {failed && <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw /> Retry</Button>}
    {confirmation && <Button size="sm" onClick={onConfirm}>Confirm ${Number(job.result?.estimate || job.result?.estimated_cost || 0).toFixed(4)}</Button>}
  </div>
}

export function SpeechPartCard({ part, job, index, count, selected, playing, directory, onSelect, onRetryJob, onConfirmJob, actions }: {
  part: ProductionPart
  job: (DurableJob<GenerateResult> & { request?: unknown }) | null
  index: number
  count: number
  selected: boolean
  playing: boolean
  directory: VoiceDirectory
  onSelect: (checked: boolean, shift: boolean) => void
  onRetryJob: () => void
  onConfirmJob: () => void
  actions: SequenceActions
}) {
  const playable = Boolean(part.filename) && part.kind !== "draft"
  const pending = !part.selected_take_id
  const duration = partDurationMs(part) / 1000
  const displayVoice = part.voice_name || part.voice
  const voice = resolveVoice(displayVoice, directory, part.voice_identity_id)
  return <article id={`part-${part.id}`} className={cn("sequence-card speech-part-card", part.kind === "draft" && "draft", selected && "selected", playing && "playing", part.missing && "missing")}>
    <div className="sequence-card-select"><Checkbox checked={selected} onClick={(event) => onSelect(!selected, event.shiftKey)} aria-label={`Select part ${index + 1}`} /></div>
    <button className="sequence-card-open" onClick={() => actions.openPart(part)} aria-label={`Open details for part ${index + 1}`}>
      <div className="sequence-card-heading">
        <VoiceIdentity voice={displayVoice} identityId={part.voice_identity_id} directory={directory} compact />
        <span className="sequence-card-status"><b>{duration ? formatDuration(duration) : "Not recorded"}</b>{pending && <Badge variant="secondary">Not recorded</Badge>}{part.outdated && <Badge variant="destructive"><CircleAlert /> Take outdated</Badge>}{part.missing && <Badge variant="destructive"><CircleAlert /> Missing audio</Badge>}{part.fidelity && part.fidelity.status !== "pass" && <Badge variant="destructive"><CircleAlert /> Check wording</Badge>}</span>
      </div>
      <p dir={textDirection(part.text || "")}>{clipText(part.text || "Untitled speech", 220)}</p>
      <div className="sequence-card-meta">
        <span>{part.cast_role_name ? `Cast · ${part.cast_role_name}` : "Direct voice"}</span>
        {part.engine && <SpeechRouteLabel route={part} config={directory.config} />}
        <span>{part.spent ? `${formatMoney(part.spent)} generated` : pending ? "No take yet" : "Historical result"}</span>
        {part.takes ? <span>{part.takes} {part.takes === 1 ? "take" : "takes"}</span> : null}
        {part.subtitled && <span><Captions /> Captions{part.subtitles_stale ? " stale" : ""}</span>}
        {part.languages?.map((language) => <span key={language}>{language}</span>)}
      </div>
    </button>
    <div className="sequence-card-actions">
      {playable && <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" onClick={() => actions.play({ key: `part:${part.id}`, url: audioUrl(part.filename!), title: `Part ${index + 1}`, subtitle: voice.name, kind: "take" })} aria-label={playing ? "Pause part" : "Play part"}>{playing ? <Pause /> : <Play />}</Button></TooltipTrigger><TooltipContent>{playing ? "Pause this part" : "Play this part"}</TooltipContent></Tooltip>}
      {part.kind === "draft" && <Button onClick={() => actions.openPart(part)}><Mic2 /> Record</Button>}
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Part actions"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => actions.openPart(part)}><Pencil /> Open details</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.duplicate(part)}><Copy /> Duplicate</DropdownMenuItem>
        <DropdownMenuItem disabled={index === 0} onSelect={() => actions.move(part, -1)}><ChevronUp /> Move earlier</DropdownMenuItem>
        <DropdownMenuItem disabled={index === count - 1} onSelect={() => actions.move(part, 1)}><ChevronDown /> Move later</DropdownMenuItem>
        <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => actions.remove(part)}><Trash2 /> Delete part</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
    </div>
    <SpeechOperation job={job} onRetry={onRetryJob} onConfirm={onConfirmJob} />
  </article>
}
