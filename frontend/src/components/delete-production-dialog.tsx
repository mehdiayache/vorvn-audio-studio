import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { studioApi } from "@/lib/api"

type DeletableProduction = { id: number; name: string }

export function DeleteProductionDialog({ production, open, onOpenChange, onDeleted }: {
  production: DeletableProduction | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [confirmation, setConfirmation] = useState("")
  const [deleting, setDeleting] = useState(false)
  useEffect(() => { if (open) setConfirmation("") }, [open, production?.id])
  if (!production) return null

  async function remove() {
    setDeleting(true)
    try {
      await studioApi.deleteProduction(production!.id)
      toast.success("Production permanently deleted.")
      onOpenChange(false)
      onDeleted()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The Production could not be deleted.")
    } finally {
      setDeleting(false)
    }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!deleting) onOpenChange(next) }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Permanently delete “{production.name}”?</DialogTitle>
        <DialogDescription>This permanently removes all Parts, recordings, captions, previews, exports and local Production activity. Reusable Venture assets and Voices remain. Provider charges already incurred cannot be undone.</DialogDescription>
      </DialogHeader>
      <label className="resource-create-fields">
        <span>Type <b>{production.name}</b> to confirm</span>
        <Input value={confirmation} autoComplete="off" disabled={deleting} onChange={(event) => setConfirmation(event.target.value)} />
      </label>
      <DialogFooter>
        <Button variant="outline" disabled={deleting} onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="destructive" disabled={deleting || confirmation !== production.name} onClick={() => void remove()}>{deleting ? "Deleting…" : "Delete Production permanently"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
