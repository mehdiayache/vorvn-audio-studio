import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { studioApi } from "@/lib/api"
import { resourceHref } from "@/lib/links"
import { VentureIdentityField } from "./venture-identity-field"

export function CreateVentureDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [identity, setIdentity] = useState("✨")
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (!open) { setName(""); setDescription(""); setIdentity("✨"); setFile(null) } }, [open])

  async function create() {
    setSaving(true)
    try {
      let icon = identity
      if (file) icon = (await studioApi.uploadVentureLogo(file)).url
      const venture = await studioApi.createVenture(name.trim(), description.trim())
      await studioApi.updateResource("ventures", venture.id, { icon })
      onOpenChange(false); window.location.assign(resourceHref("venture", venture.id))
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to create this Venture.") }
    finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}><DialogContent className="venture-settings-dialog"><DialogHeader><DialogTitle>New Venture</DialogTitle><DialogDescription>Create an independent brand with its own reusable media and Projects.</DialogDescription></DialogHeader><form id="create-venture-form" className="venture-create-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void create() }}><VentureIdentityField name={name} value={identity} file={file} onValueChange={setIdentity} onFileChange={setFile} /><div className="resource-create-fields"><label><span>Name</span><Input value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder="Venture name" /></label><label><span>Description <small>optional</small></span><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What belongs to this Venture?" /></label></div></form><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="create-venture-form" disabled={!name.trim() || saving}>{saving ? "Creating…" : "Create Venture"}</Button></DialogFooter></DialogContent></Dialog>
}
