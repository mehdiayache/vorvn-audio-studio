import { useState } from "react"
import { toast } from "sonner"

import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { originsApi } from "@/lib/api"

type DeletableProject = { id: number; name: string }

export function DeleteProjectDialog({ project, open, onOpenChange, onDeleted }: {
  project: DeletableProject | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  if (!project) return null

  async function remove() {
    setDeleting(true)
    try {
      await originsApi.deleteProject(project!.id)
      toast.success("Project permanently deleted.")
      onOpenChange(false)
      onDeleted()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The Project could not be deleted.")
    } finally {
      setDeleting(false)
    }
  }

  return <DeleteConfirmationDialog
    open={open}
    onOpenChange={onOpenChange}
    title={`Permanently delete “${project.name}”?`}
    description="Creative Project content, recordings, captions, previews and exports are permanently removed. Content-free provider operation and spend evidence remains in Activity. Reusable Workspace Files and Voices remain."
    confirmLabel="Delete Project permanently"
    busy={deleting}
    onConfirm={() => void remove()}
  />
}
