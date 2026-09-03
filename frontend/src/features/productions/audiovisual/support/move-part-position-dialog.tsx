import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { ProductionPart } from "@/types/domain"

export function MovePartPositionDialog({ part, count, onClose, onMove }: {
  part: ProductionPart | null
  count: number
  onClose: () => void
  onMove: (part: ProductionPart, position: number) => Promise<void>
}) {
  const [position, setPosition] = useState(1)
  const [busy, setBusy] = useState(false)
  const current = (part?.position ?? 0) + 1
  useEffect(() => setPosition(current), [current, part?.id])

  async function move() {
    if (!part || position === current) return onClose()
    setBusy(true)
    try {
      await onMove(part, position)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return <Dialog open={Boolean(part)} onOpenChange={(open) => { if (!open && !busy) onClose() }}>
    <DialogContent>
      <DialogHeader><DialogTitle>Move Part to position</DialogTitle><DialogDescription>Choose its new place in this Production. Other Parts shift automatically.</DialogDescription></DialogHeader>
      <label className="move-position-field"><span>Position</span><Input autoFocus aria-label="New Part position" type="number" min={1} max={Math.max(1, count)} value={position} onChange={(event) => setPosition(Math.max(1, Math.min(count, Number(event.target.value) || 1)))} /></label>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || position === current} onClick={() => void move()}>{busy ? "Moving…" : `Move to position ${position}`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
