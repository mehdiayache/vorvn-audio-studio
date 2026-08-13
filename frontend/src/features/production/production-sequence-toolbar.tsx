import { ChevronDown, Clock3, ListMusic, Plus } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatDuration } from "@/lib/format"

export type ProductionCanvasView = "sequence" | "timing"

export function ProductionSequenceToolbar({ view, partCount, visiblePartCount, duration, navigator, onViewChange, onAdd }: {
  view: ProductionCanvasView
  partCount: number
  visiblePartCount?: number
  duration: number
  navigator: ReactNode
  onViewChange: (view: ProductionCanvasView) => void
  onAdd: (kind: "speech" | "silence" | "asset") => void
}) {
  const filtered = visiblePartCount !== undefined && visiblePartCount !== partCount
  return <header className="production-sequence-toolbar" aria-label="Production Sequence tools">
    <div className="production-view-switch" aria-label="Production view">
      <Button size="sm" variant={view === "sequence" ? "secondary" : "ghost"} aria-pressed={view === "sequence"} onClick={() => onViewChange("sequence")}><ListMusic /> Sequence</Button>
      <Button size="sm" variant={view === "timing" ? "secondary" : "ghost"} aria-pressed={view === "timing"} onClick={() => onViewChange("timing")}><Clock3 /> Timing</Button>
    </div>
    <span className="production-sequence-summary">{filtered && <><b>{visiblePartCount}</b> of </>}<b>{partCount}</b> parts <i aria-hidden="true" /> <b>{formatDuration(duration)}</b></span>
    <div className="production-sequence-actions">
      {view === "sequence" && navigator}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm"><Plus /> Add <ChevronDown /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onAdd("speech")}><Plus /> Add speech</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAdd("silence")}><Plus /> Add silence</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAdd("asset")}><Plus /> Add Intro, Outro or Stinger</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>
}
