import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { studioApi } from "@/lib/api"
import { resourceHref } from "@/lib/links"

export type CreateKind = "venture" | "project" | "series" | "production"

type Parent = { id: number; type: "venture" | "project" | "series"; name: string } | null

const labels: Record<CreateKind, string> = {
  venture: "Venture",
  project: "Project",
  series: "Series",
  production: "Production",
}

export function CreateResourceDialog({ kind, parent, open, onOpenChange, onCreated }: {
  kind: CreateKind
  parent: Parent
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const label = labels[kind]

  useEffect(() => {
    if (!open) { setName(""); setDescription("") }
  }, [open])

  async function create() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const created = kind === "venture" ? await studioApi.createVenture(name, description)
        : kind === "project" && parent ? await studioApi.createProject(parent.id, name, description)
        : kind === "series" && parent ? await studioApi.createSeries(parent.id, name, description)
        : kind === "production" && parent ? await studioApi.createProduction(parent.type === "series" ? "series" : "projects", parent.id, name, description)
        : null
      if (!created) throw new Error(`Unable to create this ${label}.`)
      onOpenChange(false)
      onCreated?.()
      window.location.assign(resourceHref(created.type, created.public_id))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to create this ${label}.`)
    } finally {
      setSaving(false)
    }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
    <DialogContent aria-describedby="create-resource-description">
      <DialogHeader>
        <DialogTitle>New {label}</DialogTitle>
        <DialogDescription id="create-resource-description">
          {kind === "venture" ? "Create an independent brand boundary." : parent ? `Create it inside ${parent.name}.` : "Create a new resource."}
        </DialogDescription>
      </DialogHeader>
      <form id="create-resource-form" className="resource-create-fields" onSubmit={(event) => { event.preventDefault(); if (!saving) void create() }}>
        <label><span>Name</span><Input value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder={`${label} name`} /></label>
        <label><span>Description <small>optional</small></span><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this for?" /></label>
      </form>
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="create-resource-form" disabled={!name.trim() || saving}>{saving ? "Creating…" : `Create ${label}`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
