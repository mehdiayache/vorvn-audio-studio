import { useEffect, useState } from "react"

import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { SavedVisualReference } from "@/types/domain"

const types: { value: SavedVisualReference["type"]; label: string }[] = [
  { value: "character", label: "Character" }, { value: "object", label: "Object / product" },
  { value: "place", label: "Place / background" }, { value: "style", label: "Style" },
  { value: "other", label: "Other" },
]

export function SavedReferenceCreateDialog({ open, count, onOpenChange, onCreate }: {
  open: boolean
  count: number
  onOpenChange: (open: boolean) => void
  onCreate: (name: string, type: SavedVisualReference["type"]) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [type, setType] = useState<SavedVisualReference["type"]>("character")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { if (!open) { setName(""); setError("") } }, [open])
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="media-save-reference-dialog">
      <DialogHeader><DialogTitle>Save this reference</DialogTitle><DialogDescription>Reuse these {count} media item{count === 1 ? "" : "s"} across this Workspace. File ownership does not change.</DialogDescription></DialogHeader>
      <label className="media-reference-field"><span>Name</span><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Harbor guide" /></label>
      <label className="media-reference-field"><span>Type</span><Select value={type} onValueChange={(value) => setType(value as SavedVisualReference["type"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{types.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
      {error && <p className="media-composer-error" role="alert">{error}</p>}
      <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><ActionButton busy={saving} busyLabel="Saving reference…" disabled={!name.trim()} onClick={() => { setSaving(true); setError(""); void onCreate(name, type).then(() => onOpenChange(false)).catch((reason) => setError(reason instanceof Error ? reason.message : "The reference could not be saved.")).finally(() => setSaving(false)) }}>Save reference</ActionButton></DialogFooter>
    </DialogContent>
  </Dialog>
}
