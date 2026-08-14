import { Captions, CircleAlert, FileText, Filter, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { clipText } from "@/lib/format"
import type { ProductionPart } from "@/types/domain"

export type SequenceFilters = {
  query: string
  drafts: boolean
  issues: boolean
  noCaptions: boolean
}

export const EMPTY_SEQUENCE_FILTERS: SequenceFilters = { query: "", drafts: false, issues: false, noCaptions: false }

export function activeSequenceFilterCount(value: SequenceFilters) {
  return Number(Boolean(value.query.trim())) + Number(value.drafts) + Number(value.issues) + Number(value.noCaptions)
}

export function filterProductionParts(parts: ProductionPart[], issuePartIds: Set<number>, filters: SequenceFilters) {
  const query = filters.query.trim().toLocaleLowerCase()
  const sourceParts = parts.filter((part) => part.kind !== "stitch")
  return sourceParts.filter((part, index) => {
    const haystack = [`part ${index + 1}`, index + 1, part.text, part.title, part.voice_name, part.voice].filter(Boolean).join(" ").toLocaleLowerCase()
    if (query && !haystack.includes(query)) return false
    if (filters.drafts && !(part.kind === "draft" || (part.kind === "speech" && !part.clip_id))) return false
    if (filters.issues && !issuePartIds.has(part.id)) return false
    if (filters.noCaptions && (!(part.kind === "audio" || part.kind === "speech") || Boolean(part.subtitled))) return false
    return true
  })
}

export function ProductionSequenceSearch({ parts, issuePartIds, value, onChange, onLocate }: {
  parts: ProductionPart[]
  issuePartIds: Set<number>
  value: SequenceFilters
  onChange: (value: SequenceFilters) => void
  onLocate: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const activeCount = activeSequenceFilterCount(value)
  const matches = useMemo(() => filterProductionParts(parts, issuePartIds, value), [issuePartIds, parts, value])
  const toggle = (key: "drafts" | "issues" | "noCaptions") => onChange({ ...value, [key]: !value[key] })
  const locate = (id: number) => { setOpen(false); window.requestAnimationFrame(() => onLocate(id)) }
  const sourceParts = parts.filter((part) => part.kind !== "stitch")

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button className="sequence-search-trigger" size="sm" variant={activeCount ? "secondary" : "ghost"}><Search /> Search / Jump{activeCount > 0 && <span>{activeCount}</span>}</Button></PopoverTrigger>
    <PopoverContent className="sequence-search-popover" align="end">
      <header><div><span className="eyebrow">Sequence navigator</span><b>Find and filter Parts</b></div>{activeCount > 0 && <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_SEQUENCE_FILTERS)}>Clear all</Button>}</header>
      <label className="sequence-search-field"><Search /><Input autoFocus value={value.query} onChange={(event) => onChange({ ...value, query: event.target.value })} placeholder="Script, Voice, or Part number" /></label>
      <div className="sequence-filter-buttons" aria-label="Sequence filters">
        <Button size="sm" variant={value.drafts ? "secondary" : "outline"} aria-pressed={value.drafts} onClick={() => toggle("drafts")}><FileText /> Drafts</Button>
        <Button size="sm" variant={value.issues ? "secondary" : "outline"} aria-pressed={value.issues} onClick={() => toggle("issues")}><CircleAlert /> Issues</Button>
        <Button size="sm" variant={value.noCaptions ? "secondary" : "outline"} aria-pressed={value.noCaptions} onClick={() => toggle("noCaptions")}><Captions /> No captions</Button>
      </div>
      <div className="sequence-search-results" role="listbox" aria-label="Matching Production Parts">
        <div className="sequence-search-result-count"><Filter /> <b>{matches.length}</b> of {sourceParts.length} Parts</div>
        {matches.slice(0, 50).map((part) => {
          const index = sourceParts.findIndex((item) => item.id === part.id)
          return <button role="option" aria-selected={false} key={part.id} onClick={() => locate(part.id)}><span>{String(index + 1).padStart(2, "0")}</span><span><b>{part.voice_name || part.title || (part.kind === "silence" ? "Silence" : "Voice not selected")}</b><small>{clipText(part.text || part.title || part.kind, 88)}</small></span></button>
        })}
        {!matches.length && <div className="sequence-search-empty"><b>No matching Parts</b><span>Clear a filter or search for another script, Voice, or number.</span></div>}
        {matches.length > 50 && <p>Showing the first 50 matches. Refine the search to jump precisely.</p>}
      </div>
    </PopoverContent>
  </Popover>
}
