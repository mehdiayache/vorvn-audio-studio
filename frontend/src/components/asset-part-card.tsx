import { ChevronDown, ChevronUp, Copy, FileAudio, MoreHorizontal, Pause, Play, Replace, Trash2 } from "lucide-react"

import type { SequenceActions } from "@/components/sequence-actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { audioUrl } from "@/lib/api"
import { formatDuration, partDurationMs } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ProductionPart } from "@/types/domain"

export function AssetPartCard({ part, index, count, selected, playing, onSelect, onReplace, actions }: {
  part: ProductionPart
  index: number
  count: number
  selected: boolean
  playing: boolean
  onSelect: (checked: boolean, shift: boolean) => void
  onReplace: () => void
  actions: SequenceActions
}) {
  const title = part.title || "Venture audio"
  const duration = partDurationMs(part) / 1000
  return <article id={`part-${part.id}`} className={cn("sequence-card asset-part-card", selected && "selected", playing && "playing", part.missing && "missing")}>
    <div className="sequence-card-select"><Checkbox checked={selected} onClick={(event) => onSelect(!selected, event.shiftKey)} aria-label={`Select Venture audio ${index + 1}`} /></div>
    <button className="sequence-card-open" onClick={() => actions.openPart(part)} aria-label={`Open details for ${title}`}>
      <div className="sequence-card-heading"><span className="sequence-asset-identity"><span className="sequence-asset-icon"><FileAudio /></span><span><b>{title}</b><small>Linked Venture asset</small></span></span><span className="sequence-card-status"><b>{duration ? formatDuration(duration) : "Unknown duration"}</b></span></div>
      <p>{part.missing ? "The linked Venture source is unavailable." : "Reusable audio from this Venture library."}</p>
      <div className="sequence-card-meta"><span>Venture provenance</span><span>Free reuse</span></div>
    </button>
    <div className="sequence-card-actions">
      {part.filename && <Button variant="outline" size="icon" onClick={() => actions.play({ key: `part:${part.id}`, url: audioUrl(part.filename!), title, subtitle: "Venture asset", kind: "asset" })} aria-label={playing ? `Pause ${title}` : `Play ${title}`}>{playing ? <Pause /> : <Play />}</Button>}
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Asset actions"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onReplace}><Replace /> Replace from library</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.duplicate(part)}><Copy /> Duplicate</DropdownMenuItem>
        <DropdownMenuItem disabled={index === 0} onSelect={() => actions.move(part, -1)}><ChevronUp /> Move earlier</DropdownMenuItem>
        <DropdownMenuItem disabled={index === count - 1} onSelect={() => actions.move(part, 1)}><ChevronDown /> Move later</DropdownMenuItem>
        <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => actions.remove(part)}><Trash2 /> Delete asset part</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
    </div>
  </article>
}
