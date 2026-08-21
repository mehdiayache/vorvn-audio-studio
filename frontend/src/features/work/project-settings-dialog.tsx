import { Archive, ArrowUpRight, MoreHorizontal, Pencil } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { VentureMark } from "@/components/venture-mark"
import { studioApi } from "@/lib/api"
import { resourceHref } from "@/lib/links"
import type { ProjectSummary, TrailItem } from "@/types/domain"
import { ProjectCoverField } from "./project-cover-field"

export function ProjectSettingsDialog({ project, venture, onUpdated, onArchived }: {
  project: ProjectSummary
  venture?: TrailItem
  onUpdated: () => void
  onArchived?: () => void
}) {
  const nameInput = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<"settings" | "archive" | null>(null)
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [cover, setCover] = useState(project.cover_image)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode === "settings") {
      setName(project.name)
      setDescription(project.description)
      setCover(project.cover_image)
      setFile(null)
    }
  }, [mode, project])

  async function save() {
    setSaving(true)
    try {
      let coverImage = cover
      if (file) coverImage = (await studioApi.uploadProjectCover(file)).url
      await studioApi.updateResource("projects", project.id, { name: name.trim(), description: description.trim(), cover_image: coverImage })
      setMode(null)
      onUpdated()
      toast.success("Project updated.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update this Project.")
    } finally { setSaving(false) }
  }

  async function archive() {
    setSaving(true)
    try {
      await studioApi.archiveResource("projects", project.id)
      setMode(null)
      if (onArchived) onArchived()
      else onUpdated()
      toast.success("Project archived.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to archive this Project.")
    } finally { setSaving(false) }
  }

  return <>
    <DropdownMenu>
      <OperatorTooltip label={`Manage ${project.name}`} detail="Edit Project settings or archive it."><DropdownMenuTrigger asChild><Button className="project-card-menu" variant="ghost" size="icon-sm" aria-label={`Project settings for ${project.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip>
      <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setMode("settings")}><Pencil /> Project settings</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => setMode("archive")}><Archive /> Archive Project</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={mode === "settings"} onOpenChange={(open) => { if (!open && !saving) setMode(null) }}>
      <DialogContent className="project-settings-dialog" onOpenAutoFocus={(event) => { event.preventDefault(); nameInput.current?.focus() }}>
        <DialogHeader><DialogTitle>Project settings</DialogTitle><DialogDescription>Update how this Project appears inside the Venture.</DialogDescription></DialogHeader>
        {venture && <div className="project-parent-context"><VentureMark identity={venture.icon} name={venture.name} /><span><small>Venture</small><b>{venture.name}</b><em>This Project lives inside this Venture.</em></span><a href={resourceHref("venture", venture.public_id)} aria-label={`Open Venture ${venture.name}`}><ArrowUpRight /></a></div>}
        <div className="project-settings-layout"><ProjectCoverField value={cover} file={file} onFileChange={setFile} onRemove={() => setCover("")} /><div className="resource-create-fields"><label><span>Name</span><Input ref={nameInput} value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Description <small>optional</small></span><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does this Project produce?" /></label></div></div>
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setMode(null)}>Cancel</Button><Button disabled={!name.trim() || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save changes"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={mode === "archive"} onOpenChange={(open) => { if (!open && !saving) setMode(null) }}>
      <DialogContent><DialogHeader><DialogTitle>Archive {project.name}?</DialogTitle><DialogDescription>The Project disappears from this Venture. Its Productions and generated audio remain recoverable.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setMode(null)}>Cancel</Button><Button variant="destructive" disabled={saving} onClick={() => void archive()}>{saving ? "Archiving…" : "Archive Project"}</Button></DialogFooter></DialogContent>
    </Dialog>
  </>
}
