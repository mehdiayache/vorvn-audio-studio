import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { studioApi } from "@/lib/api"
import { resourceHref } from "@/lib/links"
import { ProjectCoverField } from "./project-cover-field"

export function CreateProjectDialog({ ventureId, ventureName, open, onOpenChange, onCreated }: {
  ventureId: number
  ventureName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (!open) { setName(""); setDescription(""); setFile(null) } }, [open])

  async function create() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const coverImage = file ? (await studioApi.uploadProjectCover(file)).url : ""
      const created = await studioApi.createProject(ventureId, name.trim(), description.trim())
      if (coverImage) await studioApi.updateResource("projects", created.id, { cover_image: coverImage })
      onOpenChange(false)
      onCreated()
      window.location.assign(resourceHref("project", created.public_id))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create this Project.")
    } finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
    <DialogContent className="project-settings-dialog">
      <DialogHeader><DialogTitle>New Project</DialogTitle><DialogDescription>Create a Project inside {ventureName}.</DialogDescription></DialogHeader>
      <form id="create-project-form" className="project-create-form" onSubmit={(event) => { event.preventDefault(); if (!saving) void create() }}>
        <div className="project-settings-layout"><ProjectCoverField value="" file={file} onFileChange={setFile} onRemove={() => setFile(null)} /><div className="resource-create-fields"><label><span>Name</span><Input value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder="Project name" /></label><label><span>Description <small>optional</small></span><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does this Project produce?" /></label></div></div>
      </form>
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="create-project-form" disabled={!name.trim() || saving}>{saving ? "Creating…" : "Create Project"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
