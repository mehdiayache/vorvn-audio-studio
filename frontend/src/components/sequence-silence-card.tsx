import { ChevronDown, ChevronUp, Clock3, Copy, MoreHorizontal, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

import type { SequenceActions } from "@/components/sequence-actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { ProductionPart } from "@/types/domain"

function SilenceDuration({ part, onSave }: { part: ProductionPart; onSave: (seconds: number) => void }) {
  const initial = Number(part.title || String((part.duration_ms || 0) / 1000) || 2)
  const [seconds, setSeconds] = useState(initial)
  useEffect(() => setSeconds(initial), [initial])
  const save = () => onSave(Math.max(0.1, Math.min(120, seconds)))
  return <label className="silence-duration"><Input aria-label="Silence duration in seconds" type="number" min={0.1} max={120} step={0.1} value={seconds} onChange={(event) => setSeconds(Number(event.target.value))} onBlur={save} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }} /><span>seconds</span></label>
}

export function SequenceSilenceCard({ part, index, count, selected, onSelect, actions }: {
  part: ProductionPart
  index: number
  count: number
  selected: boolean
  onSelect: (checked: boolean, shift: boolean) => void
  actions: SequenceActions
}) {
  return (
    <article id={`part-${part.id}`} className={cn("sequence-silence-card", selected && "selected")}>
      <Checkbox checked={selected} onClick={(event) => onSelect(!selected, event.shiftKey)} aria-label={`Select silence ${index + 1}`} />
      <button className="silence-open" onClick={() => actions.openPart(part)} aria-label={`Open details for silence ${index + 1}`}><span className="silence-icon"><Clock3 /></span><b>Silence</b></button>
      <SilenceDuration part={part} onSave={(seconds) => actions.editSilence(part, seconds)} />
      <span className="silence-cost">Free</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Silence actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => actions.openPart(part)}><Clock3 /> Open details</DropdownMenuItem><DropdownMenuItem onSelect={() => actions.duplicate(part)}><Copy /> Duplicate</DropdownMenuItem><DropdownMenuItem disabled={index === 0} onSelect={() => actions.move(part, -1)}><ChevronUp /> Move earlier</DropdownMenuItem><DropdownMenuItem disabled={index === count - 1} onSelect={() => actions.move(part, 1)}><ChevronDown /> Move later</DropdownMenuItem><DropdownMenuItem onSelect={() => actions.moveToPosition(part)}>Move to position…</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => actions.remove(part)}><Trash2 /> Delete silence</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
    </article>
  )
}
