import { ArrowDownUp, ChevronLeft, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"

export function ProductionSelectionBar({ count, onSelectAll, onReorder, onMove, onDelete, onClear }: {
  count: number
  onSelectAll: () => void
  onReorder: () => void
  onMove: () => void
  onDelete: () => void
  onClear: () => void
}) {
  if (!count) return null
  return (
    <div className="selection-bar">
      <b>{count} selected</b>
      <Button variant="ghost" onClick={onSelectAll}>Select all</Button>
      <Button variant="ghost" onClick={onReorder}><ArrowDownUp /> Move in Sequence…</Button>
      <Button variant="ghost" onClick={onMove}><ChevronLeft /> Move to Production…</Button>
      <Button variant="ghost" className="danger" onClick={onDelete}><Trash2 /> Delete</Button>
      <Button variant="ghost" size="icon" aria-label="Clear selection" onClick={onClear}><X /></Button>
    </div>
  )
}
