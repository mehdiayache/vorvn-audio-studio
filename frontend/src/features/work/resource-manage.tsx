import { Archive, MoreHorizontal, Pencil } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { studioApi } from "@/lib/api"
import { audioStudioBase } from "@/lib/links"

type Kind = "venture" | "project" | "series"
const plural = { venture: "ventures", project: "projects", series: "series" } as const

export function ResourceManage({ kind, id, name: initialName, description: initialDescription, onUpdated }: { kind: Kind; id: number; name: string; description: string; onUpdated: () => void }) {
  const [mode, setMode] = useState<"edit" | "archive" | null>(null)
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try { await studioApi.updateResource(plural[kind], id, { name, description }); setMode(null); onUpdated(); toast.success(`${kind} updated.`) }
    catch (error) { toast.error(error instanceof Error ? error.message : `Unable to update this ${kind}.`) }
    finally { setSaving(false) }
  }
  async function archive() {
    setSaving(true)
    try { await studioApi.archiveResource(plural[kind], id); window.location.assign(`${audioStudioBase}/`) }
    catch (error) { toast.error(error instanceof Error ? error.message : `Unable to archive this ${kind}.`); setSaving(false) }
  }
  return <><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={`Manage ${initialName}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { setName(initialName); setDescription(initialDescription); setMode("edit") }}><Pencil /> Edit details</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => setMode("archive")}><Archive /> Archive {kind}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    <Dialog open={mode === "edit"} onOpenChange={(open) => { if (!open && !saving) setMode(null) }}><DialogContent><DialogHeader><DialogTitle>Edit {kind}</DialogTitle><DialogDescription>Update the name and operator-facing description.</DialogDescription></DialogHeader><div className="resource-create-fields"><label><span>Name</span><Input value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Description</span><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label></div><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setMode(null)}>Cancel</Button><Button disabled={!name.trim() || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save changes"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={mode === "archive"} onOpenChange={(open) => { if (!open && !saving) setMode(null) }}><DialogContent><DialogHeader><DialogTitle>Archive {initialName}?</DialogTitle><DialogDescription>This removes it from active work without deleting generated audio. This action is recoverable from the database.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setMode(null)}>Cancel</Button><Button variant="destructive" disabled={saving} onClick={() => void archive()}>{saving ? "Archiving…" : `Archive ${kind}`}</Button></DialogFooter></DialogContent></Dialog>
  </>
}
