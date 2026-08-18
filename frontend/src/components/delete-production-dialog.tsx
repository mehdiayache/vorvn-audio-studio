import { useState } from "react"
import { toast } from "sonner"

import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { studioApi } from "@/lib/api"

type DeletableProduction = { id: number; name: string }

export function DeleteProductionDialog({ production, open, onOpenChange, onDeleted }: {
  production: DeletableProduction | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
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

  return <DeleteConfirmationDialog
    open={open}
    onOpenChange={onOpenChange}
    title={`Permanently delete “${production.name}”?`}
    description="This permanently removes all Parts, recordings, captions, previews, exports and local Production activity. Reusable Venture assets and Voices remain. Provider charges already incurred cannot be undone."
    confirmLabel="Delete Production permanently"
    busy={deleting}
    onConfirm={() => void remove()}
  />
}
