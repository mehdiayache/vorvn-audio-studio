import { useState } from "react"

import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useAsyncAction } from "@/hooks/use-async-action"
import { originsApi } from "@/lib/api"
import type { WorkspaceFolder } from "@/types/domain"

export function CreateFolderDialog({
  open,
  onOpenChange,
  workspaceId,
  projectId = null,
  parentId = null,
  locationLabel,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: number
  projectId?: number | null
  parentId?: number | null
  locationLabel: string
  onCreated: (folder: WorkspaceFolder) => void
}) {
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const action = useAsyncAction<"create">()
  const creating = action.isPending("create")

  async function submit() {
    if (!name.trim()) return
    await action.run("create", async () => {
      setError("")
      try {
        const folder = await originsApi.createFolder(
          workspaceId, name.trim(), parentId, projectId)
        setName("")
        onOpenChange(false)
        onCreated(folder)
      } catch (reason) {
        setError(reason instanceof Error
          ? reason.message
          : "This Folder could not be created.")
      }
    })
  }

  return <Dialog open={open} onOpenChange={(next) => {
    if (creating) return
    if (!next) { setName(""); setError("") }
    onOpenChange(next)
  }}><DialogContent className="workspace-resource-dialog">
    <DialogHeader><DialogTitle>New Folder</DialogTitle><DialogDescription>Create it inside {locationLabel}.</DialogDescription></DialogHeader>
    <form id="folder-create-form" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <label><span>Name</span><Input autoFocus value={name} maxLength={180} onChange={(event) => setName(event.target.value)} placeholder="References" /></label>
      {error && <p className="workspace-file-upload-error" role="alert">{error}</p>}
    </form>
    <DialogFooter><Button type="button" variant="outline" disabled={creating} onClick={() => onOpenChange(false)}>Cancel</Button><ActionButton type="submit" form="folder-create-form" disabled={!name.trim()} busy={creating} busyLabel="Creating…">Create Folder</ActionButton></DialogFooter>
  </DialogContent></Dialog>
}
