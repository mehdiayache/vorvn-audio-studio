import { ChevronDown, ChevronUp, Clock3, Copy, MoreHorizontal, Trash2, Volume2, VolumeX } from "lucide-react"
import { useEffect, useState } from "react"

import type { SequenceActions } from "@/components/sequence-actions"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { ProductionPart } from "@/types/domain"

function SilenceDuration({ part, onSave }: { part: ProductionPart; onSave: (seconds: number) => void }) {
  const initial = part.duration_ms != null
    ? Number(part.duration_ms) / 1000
    : Number(part.title || 2)
  const [seconds, setSeconds] = useState(initial)
  useEffect(() => setSeconds(initial), [initial])
  const save = () => onSave(Math.max(0.1, Math.min(120, seconds)))
  return <label className="silence-duration"><Input aria-label="Silence duration in seconds" type="number" min={0.1} max={120} step={0.1} value={seconds} onChange={(event) => setSeconds(Number(event.target.value))} onBlur={save} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }} /><span>seconds</span></label>
}

export function SequenceSilenceCard({ part, index, count, actions }: {
  part: ProductionPart
  index: number
  count: number
  actions: SequenceActions
}) {
  const enabled = part.enabled !== false
  return (
    <article id={`part-${part.id}`} className={`sequence-silence-card${enabled ? "" : " is-disabled"}`}>
      <button className="silence-open" onClick={() => actions.openPart(part)} aria-label={`Open details for silence ${index + 1}`}><span className="silence-icon"><Clock3 /></span><b>Silence</b></button>
      <SilenceDuration part={part} onSave={(seconds) => actions.editSilence(part, seconds)} />
      <span className="silence-cost">{enabled ? "Free" : "Excluded"}</span>
      <Button variant={enabled ? "ghost" : "secondary"} size="icon" onClick={() => actions.setEnabled?.(part, !enabled)} aria-label={enabled ? `Exclude silence ${index + 1} from output` : `Include silence ${index + 1} in output`}>{enabled ? <Volume2 /> : <VolumeX />}</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Silence actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => actions.openPart(part)}><Clock3 /> Open details</DropdownMenuItem><DropdownMenuItem onSelect={() => actions.duplicate(part)}><Copy /> Duplicate</DropdownMenuItem><DropdownMenuItem disabled={index === 0} onSelect={() => actions.move(part, -1)}><ChevronUp /> Move earlier</DropdownMenuItem><DropdownMenuItem disabled={index === count - 1} onSelect={() => actions.move(part, 1)}><ChevronDown /> Move later</DropdownMenuItem><DropdownMenuItem onSelect={() => actions.moveToPosition(part)}>Move to position…</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => actions.remove(part)}><Trash2 /> Delete silence</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
    </article>
  )
}
