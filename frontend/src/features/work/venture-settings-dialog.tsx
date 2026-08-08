import { Archive, MoreHorizontal, Pencil } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { studioApi } from "@/lib/api"
import { audioStudioBase } from "@/lib/links"
import type { WorkResource } from "@/types/domain"
import { VentureIdentityField } from "./venture-identity-field"

export function VentureSettingsDialog({ venture, onUpdated }: { venture: WorkResource; onUpdated: () => void }) {
  const nameInput = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<"settings" | "archive" | null>(null)
  const [name, setName] = useState(venture.name)
  const [description, setDescription] = useState(venture.description)
  const [identity, setIdentity] = useState(venture.icon)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode === "settings") { setName(venture.name); setDescription(venture.description); setIdentity(venture.icon); setFile(null) }
  }, [mode, venture])

  async function save() {
    setSaving(true)
    try {
      let icon = identity
      if (file) icon = (await studioApi.uploadVentureLogo(file)).url
      await studioApi.updateResource("ventures", venture.id, { name: name.trim(), description: description.trim(), icon })
      setMode(null); onUpdated(); toast.success("Venture updated.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update this Venture.") }
    finally { setSaving(false) }
  }

  async function archive() {
    setSaving(true)
    try { await studioApi.archiveResource("ventures", venture.id); window.location.assign(`${audioStudioBase}/`) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to archive this Venture."); setSaving(false) }
  }

  return <>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={`Manage ${venture.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setMode("settings")}><Pencil /> Venture settings</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => setMode("archive")}><Archive /> Archive Venture</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    <Dialog open={mode === "settings"} onOpenChange={(open) => { if (!open && !saving) setMode(null) }}><DialogContent className="venture-settings-dialog" onOpenAutoFocus={(event) => { event.preventDefault(); nameInput.current?.focus() }}><DialogHeader><DialogTitle>Venture settings</DialogTitle><DialogDescription>Manage the Venture identity shown across every Project and Production path.</DialogDescription></DialogHeader><VentureIdentityField name={name} value={identity} file={file} onValueChange={setIdentity} onFileChange={setFile} /><div className="resource-create-fields"><label><span>Name</span><Input ref={nameInput} value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Description <small>optional</small></span><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label></div><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setMode(null)}>Cancel</Button><Button disabled={!name.trim() || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save changes"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={mode === "archive"} onOpenChange={(open) => { if (!open && !saving) setMode(null) }}><DialogContent><DialogHeader><DialogTitle>Archive {venture.name}?</DialogTitle><DialogDescription>The Venture and its active work disappear from the workspace but remain recoverable.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setMode(null)}>Cancel</Button><Button variant="destructive" disabled={saving} onClick={() => void archive()}>{saving ? "Archiving…" : "Archive Venture"}</Button></DialogFooter></DialogContent></Dialog>
  </>
}
