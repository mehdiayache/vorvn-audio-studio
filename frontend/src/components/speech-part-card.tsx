import { useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { Captions, ChevronDown, ChevronUp, CircleAlert, Copy, Mic2, MoreHorizontal, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react"

import type { SequenceActions } from "@/components/sequence-actions"
import { SpeechOperationLane } from "@/components/speech-operation-lane"
import { speechPartCardFacts } from "@/components/speech-part-card-model"
import { VoiceIdentity } from "@/components/voice-identity"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { audioUrl } from "@/lib/api"
import { textDirection } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { DurableJob, GenerateResult, ProductionCastRole, ProductionPart, VoiceDirectory } from "@/types/domain"

import "./speech-part-card.css"

function useRenderedScriptOverflow(text: string, expanded: boolean) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    if (expanded) return
    const element = ref.current
    if (!element) return
    let active = true
    const measure = () => {
      if (active) setOverflowing(element.scrollHeight > element.clientHeight + 1)
    }
    measure()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(element)
    void document.fonts?.ready.then(measure)
    return () => {
      active = false
      observer?.disconnect()
    }
  }, [expanded, text])

  return { ref, overflowing }
}

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
  const { ref: scriptRef, overflowing } = useRenderedScriptOverflow(facts.script, expanded)
  const openPart = () => actions.openPart(part)
  const openCaptions = () => onOpenCaptions ? onOpenCaptions() : actions.openPart(part, "captions")
  const openTakes = () => onOpenTakes ? onOpenTakes() : actions.openPart(part, "takes")
  const startNewTake = () => onNewTake ? onNewTake() : actions.newTake ? actions.newTake(part) : openPart()
  const castStyle = facts.castColor ? { "--speech-cast-color": facts.castColor } as CSSProperties : undefined
  const visibleAlerts = facts.alerts.filter((alert) => alert.key !== "draft")

  return <article id={`part-${part.id}`} style={castStyle} className={cn("sequence-card speech-part-card", !facts.recorded && "draft", selected && "selected", playing && "playing", part.missing && "missing", facts.castName && "has-cast", facts.operation.kind !== "idle" && "has-operation")}>
    <span className={cn("speech-part-cast-rail", facts.castName && "has-cast")} aria-hidden="true" />
    <div className="sequence-card-select"><Checkbox checked={selected} onClick={(event) => onSelect(!selected, event.shiftKey)} aria-label={`Select part ${index + 1}`} /></div>

    <div className="speech-part-body">
      <header className="speech-part-header">
        <Tooltip>
          <TooltipTrigger asChild><button className="speech-part-heading" onClick={openPart} aria-label={`Open details for part ${index + 1}`}>
            <VoiceIdentity voice={part.voice_name || part.voice} identityId={part.voice_identity_id} directory={directory} compact showCopy={false} showEditorialFlag={false} />
            <span className="speech-part-heading-copy">
              {facts.castName
                ? <><b className="speech-part-role-name">{facts.castName}</b><span className="speech-part-selected-voice">{facts.selectedVoiceName}</span></>
                : <b className="speech-part-voice-name">{facts.selectedVoiceName}</b>}
              <span className="speech-part-method">{facts.methodLine}</span>
              {facts.futureVoiceName && <span className="speech-part-future-voice">Future recordings · {facts.futureVoiceName}</span>}
            </span>
          </button></TooltipTrigger>
          <TooltipContent>{facts.technicalDetail || "Selected Take recording method"}</TooltipContent>
        </Tooltip>
        {visibleAlerts.length > 0 && <div className="speech-part-alerts" aria-label="Part states">
          {visibleAlerts.map((alert) => <span key={alert.key} className={`speech-part-alert is-${alert.tone}`}><CircleAlert />{alert.label}</span>)}
        </div>}
      </header>

      <Collapsible open={expanded} onOpenChange={setExpanded} className="speech-part-script">
        <p ref={scriptRef} className={cn("speech-part-script-copy", expanded && "is-expanded")} dir={textDirection(facts.script)}>{facts.script}</p>
        {overflowing && <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="speech-part-script-toggle" aria-expanded={expanded}>
          {expanded ? <>Show less <ChevronUp /></> : <>Show more <ChevronDown /></>}
        </Button></CollapsibleTrigger>}
      </Collapsible>

      <footer className="speech-part-result">
        {facts.recorded ? <>
          <div className="speech-part-playback">
            {facts.playable && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="speech-part-play" onClick={() => actions.play({ key: `part:${part.id}`, url: audioUrl(part.filename!), title: `Part ${index + 1}`, subtitle: facts.selectedVoiceName, kind: "take" })} aria-label={playing ? "Pause part" : "Play part"}>{playing ? <Pause /> : <Play />}</Button></TooltipTrigger><TooltipContent>{playing ? "Pause selected Take" : "Play selected Take"}</TooltipContent></Tooltip>}
            <span>{facts.durationLabel}</span>
          </div>
          <button onClick={openTakes} className="speech-part-take-summary" title={facts.takeSummary} aria-label={facts.takeSummary}>{facts.selectedTakeLabel}</button>
          <button onClick={openCaptions} className={`speech-part-caption is-${facts.captionTone}`}><Captions />{facts.captionSummary}</button>
          <span className="speech-part-spend" title={facts.spendSummary}>{facts.spendValue}</span>
        </> : <span className="speech-part-not-recorded">Not recorded</span>}

        <div className="speech-part-actions">
          {!facts.recorded && <><Button variant="ghost" size="sm" onClick={openPart}>Continue writing</Button><Button size="sm" onClick={openPart}><Mic2 />Record</Button></>}
          {facts.recorded && <Button variant="ghost" size="sm" onClick={startNewTake}><Plus />New Take</Button>}
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Part actions"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={openPart}><Pencil />Open details</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.duplicate(part)}><Copy />Duplicate</DropdownMenuItem>
            <DropdownMenuItem disabled={index === 0} onSelect={() => actions.move(part, -1)}><ChevronUp />Move earlier</DropdownMenuItem>
            <DropdownMenuItem disabled={index === count - 1} onSelect={() => actions.move(part, 1)}><ChevronDown />Move later</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.moveToPosition(part)}>Move to position…</DropdownMenuItem>
            <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => actions.remove(part)}><Trash2 />Delete part</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>
        </div>
      </footer>

      <SpeechOperationLane operation={facts.operation} onRetry={onRetryJob} onConfirm={onConfirmJob} onReviewTake={openTakes} />
    </div>
  </article>
}
