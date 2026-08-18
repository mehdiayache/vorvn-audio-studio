import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export function DeleteConfirmationDialog({ open, onOpenChange, title, description, confirmLabel = "Delete permanently", busy = false, onConfirm }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
}) {
  const [confirmation, setConfirmation] = useState("")
  useEffect(() => { if (open) setConfirmation("") }, [open])

  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <label className="resource-create-fields">
        <span>Type <b>DELETE</b> to confirm</span>
        <Input aria-label="Type DELETE to confirm" value={confirmation} autoComplete="off" autoCapitalize="characters" disabled={busy} onChange={(event) => setConfirmation(event.target.value)} />
      </label>
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="destructive" disabled={busy || confirmation !== "DELETE"} onClick={onConfirm}>{busy ? "Deleting…" : confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
