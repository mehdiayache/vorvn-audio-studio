import { Clock3, ListMusic, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatDuration } from "@/lib/format"

export type ProductionCanvasView = "sequence" | "timing"

export function ProductionSequenceToolbar({ view, partCount, duration, onViewChange, onAdd }: {
  view: ProductionCanvasView
  partCount: number
  duration: number
  onViewChange: (view: ProductionCanvasView) => void
  onAdd: () => void
}) {
  return <header className="production-sequence-toolbar" aria-label="Production Sequence tools">
    <div className="production-view-switch" aria-label="Production view">
      <Button size="sm" variant={view === "sequence" ? "secondary" : "ghost"} aria-pressed={view === "sequence"} onClick={() => onViewChange("sequence")}><ListMusic /> Sequence</Button>
      <Button size="sm" variant={view === "timing" ? "secondary" : "ghost"} aria-pressed={view === "timing"} onClick={() => onViewChange("timing")}><Clock3 /> Timing</Button>
    </div>
    <span className="production-sequence-summary"><b>{partCount}</b> parts <i aria-hidden="true" /> <b>{formatDuration(duration)}</b></span>
    <Button size="sm" onClick={onAdd}><Plus /> Add</Button>
  </header>
}
