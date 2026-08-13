import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export function MoveSelectionPositionDialog({ open, count, selectedCount, onClose, onMove }: {
  open: boolean
  count: number
  selectedCount: number
  onClose: () => void
  onMove: (position: number) => Promise<void>
}) {
  const [position, setPosition] = useState(1)
  const [busy, setBusy] = useState(false)
  const maxPosition = Math.max(1, count - selectedCount + 1)
  useEffect(() => { if (open) setPosition(1) }, [open])

  async function move() {
    setBusy(true)
    try {
      await onMove(position)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose() }}>
    <DialogContent>
      <DialogHeader><DialogTitle>Move selected Parts</DialogTitle><DialogDescription>Place {selectedCount} selected Part{selectedCount === 1 ? "" : "s"} together in this Sequence. Their current relative order is preserved.</DialogDescription></DialogHeader>
      <label className="move-position-field"><span>Start at position</span><Input autoFocus aria-label="New selection position" type="number" min={1} max={maxPosition} value={position} onChange={(event) => setPosition(Math.max(1, Math.min(maxPosition, Number(event.target.value) || 1)))} /></label>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || !selectedCount} onClick={() => void move()}>{busy ? "Moving…" : `Move to position ${position}`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
