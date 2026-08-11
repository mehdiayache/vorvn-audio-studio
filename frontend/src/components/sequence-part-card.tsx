import { Captions, ChevronDown, ChevronUp, CircleAlert, Copy, FileAudio, GripVertical, LoaderCircle, Mic2, MoreHorizontal, Pause, Pencil, Play, RefreshCw, Trash2, X } from "lucide-react"

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
import type { ProductionPart, RenderTask, VoiceDirectory } from "@/types/domain"

function kindLabel(part: ProductionPart) {
  if (part.kind === "draft") return "Draft speech"
  if (part.kind === "asset") return "Venture asset"
  return "Recorded speech"
}

export function SequencePartCard({ part, renderTask, index, count, selected, playing, directory, onSelect, onRetryRender, onDismissRender, actions }: {
  part: ProductionPart
  renderTask?: RenderTask
  index: number
  count: number
  selected: boolean
  playing: boolean
  directory: VoiceDirectory
  onSelect: (checked: boolean, shift: boolean) => void
  onRetryRender: (task: RenderTask) => void
  onDismissRender: (id: string) => void
  actions: SequenceActions
}) {
  const playable = Boolean(part.filename) && part.kind !== "draft"
  const duration = partDurationMs(part) / 1000
  const voice = resolveVoice(part.voice, directory, part.voice_identity_id)
  const asset = part.kind === "asset"
  const title = asset ? part.title || "Venture audio" : voice.name
  return (
    <article id={`part-${part.id}`} className={cn("sequence-card", asset && "asset", part.kind === "draft" && "draft", selected && "selected", playing && "playing", part.missing && "missing")}>
      <div className="sequence-card-select">
        <Checkbox checked={selected} onClick={(event) => onSelect(!selected, event.shiftKey)} aria-label={`Select part ${index + 1}`} />
        <GripVertical aria-hidden="true" />
      </div>
      <button className="sequence-card-open" onClick={() => actions.openPart(part)} aria-label={`Open details for part ${index + 1}`}>
        <div className="sequence-card-heading">
          {asset ? <span className="sequence-asset-identity"><span className="sequence-asset-icon"><FileAudio /></span><span><b>{title}</b><small>Linked Venture asset</small></span></span> : <VoiceIdentity voice={part.voice} identityId={part.voice_identity_id} directory={directory} compact />}
          <span className="sequence-card-status"><b>{duration ? formatDuration(duration) : "Draft"}</b>{part.kind === "draft" && <Badge variant="secondary">Not recorded</Badge>}{part.outdated && <Badge variant="destructive"><CircleAlert /> Take outdated</Badge>}{part.missing && <Badge variant="destructive"><CircleAlert /> Missing</Badge>}{part.fidelity && part.fidelity.status !== "pass" && <Badge variant="destructive"><CircleAlert /> Check wording</Badge>}</span>
        </div>
        <p dir={textDirection(part.text || part.title || "")}>{clipText(part.text || part.title || "Untitled part", 190)}</p>
        <div className="sequence-card-meta">
          <span>{kindLabel(part)}</span>
          {!asset && part.engine && <SpeechRouteLabel route={part} config={directory.config} />}
          {part.cast_role_name && <span>Cast · {part.cast_role_name}</span>}
          <span>{part.spent ? `${formatMoney(part.spent)} generated` : "Free reuse"}</span>
          {part.takes ? <span>{part.takes} {part.takes === 1 ? "take" : "takes"}</span> : null}
          {part.subtitled && <span><Captions /> Captions{part.subtitles_stale ? " stale" : ""}</span>}
          {part.languages?.map((language) => <span key={language}>{language}</span>)}
          {part.fidelity?.status === "pass" && <span>Script verified</span>}
        </div>
      </button>
      <div className="sequence-card-actions">
        {playable && <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" onClick={() => actions.play({ key: `part:${part.id}`, url: audioUrl(part.filename), title: `Part ${index + 1}`, subtitle: asset ? "Linked Venture asset" : voice.name, kind: asset ? "asset" : "part" })} aria-label={playing ? "Pause part" : "Play part"}>{playing ? <Pause /> : <Play />}</Button></TooltipTrigger><TooltipContent>{playing ? "Pause this part" : "Play this part"}</TooltipContent></Tooltip>}
        {part.kind === "draft" && <Button onClick={() => actions.openPart(part)}><Mic2 /> Record</Button>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Part actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => actions.openPart(part)}><Pencil /> Open details</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.duplicate(part)}><Copy /> Duplicate</DropdownMenuItem>
            <DropdownMenuItem disabled={index === 0} onSelect={() => actions.move(part, -1)}><ChevronUp /> Move earlier</DropdownMenuItem>
            <DropdownMenuItem disabled={index === count - 1} onSelect={() => actions.move(part, 1)}><ChevronDown /> Move later</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => actions.remove(part)}><Trash2 /> Delete part</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {renderTask && <div className={`take-render-status ${renderTask.status}`} role="status" aria-live="polite">
        {renderTask.status === "generating" ? <><LoaderCircle className="spin" /><span><b>{renderTask.mode === "draft" ? "Recording this draft…" : "Generating a new take…"}</b><small>The current card stays usable while Alibaba works.</small></span></> : <><CircleAlert /><span><b>New take failed</b><small>{renderTask.error}</small></span><Button variant="outline" size="sm" onClick={() => onRetryRender(renderTask)}><RefreshCw /> Retry</Button><Button variant="ghost" size="icon" aria-label="Dismiss failed take" onClick={() => onDismissRender(renderTask.id)}><X /></Button></>}
      </div>}
    </article>
  )
}
