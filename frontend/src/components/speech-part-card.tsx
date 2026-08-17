import { useLayoutEffect, useRef, useState } from "react"
import { ArrowUpDown, AudioLines, Captions, ChevronDown, ChevronUp, CircleAlert, Copy, Info, MoreHorizontal, Pause, Pencil, Play, Trash2, Volume2, VolumeX } from "lucide-react"

import { AudioWaveform } from "@/components/audio-waveform"
import { InlineDeliveryTags } from "@/components/inline-delivery-tags"
import type { SequenceActions } from "@/components/sequence-actions"
import { SpeechOperationLane } from "@/components/speech-operation-lane"
import { speechPartCardFacts } from "@/components/speech-part-card-model"
import { VoiceIdentity } from "@/components/voice-identity"
import { VoiceGenderBadge } from "@/components/voice-gender-badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { audioUrl } from "@/lib/api"
import { formatAuthoredRole, formatPartNumber, formatPartRoleLabel, textDirection } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { DurableJob, GenerateResult, ProductionPart, VoiceDirectory } from "@/types/domain"

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

export function SpeechPartCard({ part, job, captionJob, index, playing, playingPreview = false, directory, onRetryJob, onConfirmJob, onOpenCaptions, actions }: {
  part: ProductionPart
  job: DurableJob<GenerateResult> | null
  captionJob?: DurableJob<unknown> | null
  index: number
  playing: boolean
  playingPreview?: boolean
  directory: VoiceDirectory
  onRetryJob: () => void
  onConfirmJob: () => void
  onOpenCaptions?: () => void
  actions: SequenceActions
}) {
  const [expanded, setExpanded] = useState(false)
  const facts = speechPartCardFacts({ part, speechJob: job, captionJob, directory })
  const { ref: scriptRef, overflowing } = useRenderedScriptOverflow(facts.script, expanded)
  const openPart = () => actions.openPart(part)
  const openCaptions = () => onOpenCaptions ? onOpenCaptions() : actions.openPart(part, "captions")
  const editSpeech = () => actions.editSpeech ? actions.editSpeech(part) : openPart()
  const visibleAlerts = facts.alerts.filter((alert) => alert.key !== "draft")
  const roleLabel = formatAuthoredRole(part.authored_role)
  const identityKey = roleLabel || part.voice_identity_id || part.catalogue_voice_id || part.voice || part.public_id || String(part.id)
  const identityTone = Array.from(String(identityKey)).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 4 + 2
  const operationTone = facts.operation.kind === "idle" ? null : facts.operation.kind
  const warning = facts.captionTone === "warning" || visibleAlerts.some((alert) => alert.tone === "warning")
  const danger = facts.captionTone === "danger" || visibleAlerts.some((alert) => alert.tone === "danger") || facts.operation.kind === "failed"
  const enabled = part.enabled !== false

  return <article id={`part-${part.id}`} data-operation={operationTone || undefined} className={cn("sequence-card speech-part-card", `identity-tone-${identityTone}`, `input-${facts.inputLabel?.toLowerCase() || "unknown"}`, !facts.recorded && "draft", !enabled && "is-disabled", playing && "playing", playingPreview && "playing-preview", warning && "has-warning", danger && "has-danger", part.missing && "missing", facts.operation.kind !== "idle" && "has-operation")}>
    <span className="speech-part-identity-rail" aria-hidden="true" />
    <div className="speech-part-order">
      <div className="speech-part-number">
        <span>{formatPartNumber(index)}</span>
      </div>
    </div>

    <div className="speech-part-body">
      <header className="speech-part-main-header">
        <div className="speech-part-header-copy">
          <div className="speech-part-identity">
            <Tooltip>
              <TooltipTrigger asChild><button className="speech-part-heading" onClick={openPart} aria-label={`Open details for part ${index + 1}`}>
                <VoiceIdentity voice={part.catalogue_voice_id || part.voice || part.voice_name} identityId={part.voice_identity_id} directory={directory} compact showCopy={false} showEditorialFlag={false} />
                <span className="speech-part-heading-copy">{roleLabel && <b className="speech-part-role"><i aria-hidden="true" />{roleLabel}</b>}<span className={cn("speech-part-voice-name", !roleLabel && "is-primary")}><span>{facts.selectedVoiceName}</span><VoiceGenderBadge gender={facts.voice.gender} /></span><span className="speech-part-method">{facts.methodLine}</span></span>
              </button></TooltipTrigger>
              <TooltipContent>{facts.technicalDetail || "Active recording method"}</TooltipContent>
            </Tooltip>
          </div>
          <div className="speech-part-main-state">
            {!enabled && <span className="speech-part-output-off"><VolumeX /> Excluded from output</span>}
            {playingPreview && <span className="speech-part-preview-playing"><AudioLines /> Playing in Production preview</span>}
            {visibleAlerts.length > 0 && <div className="speech-part-alerts" aria-label="Part states">{visibleAlerts.map((alert) => <span key={alert.key} className={`speech-part-alert is-${alert.tone}`}><CircleAlert />{alert.label}</span>)}</div>}
          </div>
        </div>
        <div className="speech-part-top-actions">
          <Tooltip><TooltipTrigger asChild><Button variant={enabled ? "ghost" : "secondary"} size="icon" onClick={() => actions.setEnabled?.(part, !enabled)} aria-label={enabled ? `Exclude part ${index + 1} from output` : `Include part ${index + 1} in output`}>{enabled ? <Volume2 /> : <VolumeX />}</Button></TooltipTrigger><TooltipContent>{enabled ? "Exclude from preview and export" : "Include in preview and export"}</TooltipContent></Tooltip>
          <Button variant="outline" size="sm" className="speech-part-edit" onClick={editSpeech} aria-label={`Edit part ${index + 1}`}><Pencil /> Edit</Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Part actions"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={openPart}><Info />Details</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.moveToPosition(part)}><ArrowUpDown />Move to position…</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.duplicate(part)}><Copy />Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => actions.remove(part)}><Trash2 />Delete Part permanently</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>
        </div>
      </header>

      <Collapsible open={expanded} onOpenChange={setExpanded} className="speech-part-script">
        <p ref={scriptRef} className={cn("speech-part-script-copy", expanded && "is-expanded")} dir={textDirection(facts.script)}>{facts.scriptState === "tagged" ? <InlineDeliveryTags text={facts.script} /> : facts.script}</p>
        {overflowing && <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="speech-part-script-toggle" aria-expanded={expanded}>
          {expanded ? <>Show less <ChevronUp /></> : <>Show more <ChevronDown /></>}
        </Button></CollapsibleTrigger>}
      </Collapsible>

      <footer className="speech-part-result">
        {facts.recorded ? <>
          <div className="speech-part-playback">
            {facts.playable && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="speech-part-play" onClick={() => actions.play({ key: `part:${part.id}`, url: audioUrl(part.filename!), title: formatPartRoleLabel(index, part.authored_role), subtitle: facts.selectedVoiceName, kind: "clip" })} aria-label={playing ? "Pause part" : "Play part"}>{playing ? <Pause /> : <Play />}</Button></TooltipTrigger><TooltipContent>{playing ? "Pause recording" : "Play recording"}</TooltipContent></Tooltip>}
            {(playing || facts.operation.kind === "active") && <span className="speech-part-waveform"><AudioWaveform url={part.filename ? audioUrl(part.filename) : undefined} bars={34} /></span>}
            <span>{facts.durationLabel}</span>
          </div>
          <button onClick={openCaptions} className={`speech-part-caption is-${facts.captionTone}`} aria-label={`Captions: ${facts.captionSummary}`}><Captions />{facts.captionSummary}</button>
        </> : <span className="speech-part-not-recorded">Not recorded</span>}

        <SpeechOperationLane operation={facts.operation} onRetry={onRetryJob} onConfirm={onConfirmJob} />
        {facts.recorded && <span className="speech-part-spend" title={facts.spendSummary}>{facts.spendValue}</span>}
        <div className="speech-part-actions">
          {!facts.recorded && <Button size="sm" onClick={editSpeech}>Generate</Button>}
        </div>
      </footer>
    </div>
  </article>
}
