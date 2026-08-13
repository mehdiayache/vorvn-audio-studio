import { CircleAlert, Clock3, ListMusic, Plus } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { formatDuration } from "@/lib/format"

export type ProductionCanvasView = "sequence" | "timing"

export function ProductionSequenceToolbar({ view, partCount, visiblePartCount, duration, issueCount, navigator, onViewChange, onIssues, onAdd }: {
  view: ProductionCanvasView
  partCount: number
  visiblePartCount?: number
  duration: number
  issueCount: number
  navigator: ReactNode
  onViewChange: (view: ProductionCanvasView) => void
  onIssues: () => void
  onAdd: () => void
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
      {view === "sequence" && <Button size="sm" variant={issueCount ? "outline" : "ghost"} className={issueCount ? "has-issues" : undefined} onClick={onIssues}><CircleAlert /> Issues{issueCount > 0 && <span>{issueCount}</span>}</Button>}
      <Button size="sm" onClick={onAdd}><Plus /> Add</Button>
    </div>
  </header>
}
