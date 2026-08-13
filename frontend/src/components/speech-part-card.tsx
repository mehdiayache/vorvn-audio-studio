import { useState, type CSSProperties } from "react"
import { Captions, ChevronDown, ChevronUp, CircleAlert, Copy, Mic2, MoreHorizontal, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react"

import type { SequenceActions } from "@/components/sequence-actions"
import { SpeechOperationLane } from "@/components/speech-operation-lane"
import { speechPartCardFacts } from "@/components/speech-part-card-model"
import { VoiceIdentity } from "@/components/voice-identity"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { audioUrl } from "@/lib/api"
import { textDirection } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { DurableJob, GenerateResult, ProductionCastRole, ProductionPart, VoiceDirectory } from "@/types/domain"

import "./speech-part-card.css"

export function SpeechPartCard({ part, job, captionJob, castRole, index, count, selected, playing, directory, onSelect, onRetryJob, onConfirmJob, onOpenCaptions, onOpenTakes, onNewTake, actions }: {
  part: ProductionPart
  job: (DurableJob<GenerateResult> & { request?: { select_result?: boolean } }) | null
  captionJob?: DurableJob<unknown> | null
  castRole?: ProductionCastRole
  index: number
  count: number
  selected: boolean
  playing: boolean
  directory: VoiceDirectory
  onSelect: (checked: boolean, shift: boolean) => void
  onRetryJob: () => void
  onConfirmJob: () => void
  onOpenCaptions?: () => void
  onOpenTakes?: () => void
  onNewTake?: () => void
  actions: SequenceActions
}) {
  const [expanded, setExpanded] = useState(false)
  const facts = speechPartCardFacts({ part, speechJob: job, captionJob, directory, castRole })
  const expandable = facts.script.length > 260 || facts.script.split(/\r?\n/).length > 4
  const openPart = () => actions.openPart(part)
  const openCaptions = () => onOpenCaptions ? onOpenCaptions() : actions.openPart(part, "captions")
  const openTakes = () => onOpenTakes ? onOpenTakes() : actions.openPart(part, "takes")
  const startNewTake = () => onNewTake ? onNewTake() : actions.newTake ? actions.newTake(part) : openPart()
  const castStyle = facts.castColor ? { "--speech-cast-color": facts.castColor } as CSSProperties : undefined
  return <article id={`part-${part.id}`} style={castStyle} className={cn("sequence-card speech-part-card", !facts.recorded && "draft", selected && "selected", playing && "playing", part.missing && "missing")}>
    <span className={cn("speech-part-cast-rail", facts.castName && "has-cast")} aria-hidden="true" />
    <div className="sequence-card-select"><Checkbox checked={selected} onClick={(event) => onSelect(!selected, event.shiftKey)} aria-label={`Select part ${index + 1}`} /></div>

    <div className="speech-part-body">
      <header className="speech-part-header">
        <button className="speech-part-identity" onClick={openPart} aria-label={`Open details for part ${index + 1}`}>
          {facts.castName && <span className="speech-part-cast-copy"><i aria-hidden="true" /><span><small>Cast</small><b>{facts.castName}</b></span></span>}
          <VoiceIdentity voice={part.voice_name || part.voice} identityId={part.voice_identity_id} directory={directory} compact />
          {facts.directVoice && <span className="speech-part-direct-voice">Direct voice</span>}
        </button>
        <div className="speech-part-alerts" aria-label="Part states">
          {facts.alerts.map((alert) => <Badge key={alert.key} variant={alert.tone === "danger" ? "destructive" : alert.tone === "warning" ? "outline" : "secondary"} className={`speech-part-alert is-${alert.tone}`}>
            {alert.tone !== "neutral" && <CircleAlert />}{alert.label}
          </Badge>)}
        </div>
      </header>

      <Tooltip>
        <TooltipTrigger asChild><button className="speech-part-method" onClick={openPart}>
          <span>{facts.methodLine}</span>
        </button></TooltipTrigger>
        <TooltipContent>{facts.technicalDetail || "Selected Take recording method"}</TooltipContent>
      </Tooltip>
      {facts.futureVoiceName && <p className="speech-part-future-voice">Future recordings · <b>{facts.futureVoiceName}</b></p>}

      <Collapsible open={expanded} onOpenChange={setExpanded} className="speech-part-script">
        <p className={cn("speech-part-script-copy", expanded && "is-expanded")} dir={textDirection(facts.script)}>{facts.script}</p>
        {expandable && <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="speech-part-script-toggle">
          {expanded ? <>Show less <ChevronUp /></> : <>Show more <ChevronDown /></>}
        </Button></CollapsibleTrigger>}
      </Collapsible>

      <div className="speech-part-truth-row">
        <button onClick={openTakes} className="speech-part-take-summary">{facts.takeSummary}</button>
        <Separator orientation="vertical" />
        <button onClick={openCaptions} className={`speech-part-caption is-${facts.captionTone}`}><Captions /> {facts.captionSummary}</button>
        <Separator orientation="vertical" />
        <span className="speech-part-spend">{facts.spendSummary}</span>
      </div>
    </div>

    <div className="sequence-card-actions speech-part-actions">
      {facts.playable && <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" onClick={() => actions.play({ key: `part:${part.id}`, url: audioUrl(part.filename!), title: `Part ${index + 1}`, subtitle: facts.selectedVoiceName, kind: "take" })} aria-label={playing ? "Pause part" : "Play part"}>{playing ? <Pause /> : <Play />}</Button></TooltipTrigger><TooltipContent>{playing ? "Pause this part" : "Play selected Take"}</TooltipContent></Tooltip>}
      {!facts.recorded && <><Button variant="ghost" size="sm" onClick={openPart}>Continue writing</Button><Button size="sm" onClick={openPart}><Mic2 /> Record</Button></>}
      {facts.recorded && <Button variant="outline" size="sm" onClick={startNewTake}><Plus /> New Take</Button>}
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Part actions"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={openPart}><Pencil /> Open details</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.duplicate(part)}><Copy /> Duplicate</DropdownMenuItem>
        <DropdownMenuItem disabled={index === 0} onSelect={() => actions.move(part, -1)}><ChevronUp /> Move earlier</DropdownMenuItem>
        <DropdownMenuItem disabled={index === count - 1} onSelect={() => actions.move(part, 1)}><ChevronDown /> Move later</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.moveToPosition(part)}>Move to position…</DropdownMenuItem>
        <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => actions.remove(part)}><Trash2 /> Delete part</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
    </div>

    <SpeechOperationLane operation={facts.operation} onRetry={onRetryJob} onConfirm={onConfirmJob} onReviewTake={openTakes} />
  </article>
}
