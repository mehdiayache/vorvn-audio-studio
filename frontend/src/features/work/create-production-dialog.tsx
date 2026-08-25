import { FileJson2, FilePlus2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ProductionImportTool } from "@/features/production/production-import-tool"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"
import { studioApi } from "@/lib/api"
import { resourceHref } from "@/lib/links"

export type ProductionParent = { id: number; type: "project" | "series"; name: string }

export function CreateProductionDialog({ parents, open, onOpenChange, onCreated }: {
  parents: ProductionParent[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}) {
  const [path, setPath] = useState<"choose" | "empty" | "import">("choose")
  const [parentId, setParentId] = useState(String(parents[0]?.id || ""))
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const voices = useVoiceDirectory()
  const player = useGlobalPlayer()
  const parent = parents.find((item) => String(item.id) === parentId) || parents[0]

  useEffect(() => {
    if (!open) { setPath("choose"); setName(""); setDescription(""); setParentId(String(parents[0]?.id || "")) }
  }, [open, parents])

  async function createEmpty() {
    if (!parent || !name.trim()) return
    setSaving(true)
    try {
      const created = await studioApi.createProduction(
        parent.type === "series" ? "series" : "projects", parent.id,
        name.trim(), description.trim())
      onOpenChange(false); onCreated?.()
      window.location.assign(resourceHref(created.type, created.public_id))
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Unable to create this Production.")
    } finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
    <DialogContent className={path === "import" ? "tool-dialog import-dialog" : "create-production-dialog"}>
      <DialogHeader><DialogTitle>New Production</DialogTitle><DialogDescription>{path === "choose" ? "Start with an empty Sequence or bring in an authored JSON Production." : path === "empty" ? "Create an empty Production and start in Sequence." : "Validate, configure and prepare the imported Production."}</DialogDescription></DialogHeader>
      {path === "choose" && <>
        {parents.length > 1 && <label className="create-production-location"><span>Create inside</span><Select value={parentId} onValueChange={setParentId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{parents.map((item) => <SelectItem value={String(item.id)} key={`${item.type}:${item.id}`}>{item.type === "series" ? "Series" : "Project"} · {item.name}</SelectItem>)}</SelectContent></Select></label>}
        <div className="create-production-paths">
          <button type="button" onClick={() => setPath("empty")}><span><FilePlus2 /></span><b>Start empty</b><small>Create a blank Production and add Parts manually.</small></button>
          <button type="button" onClick={() => setPath("import")}><span><FileJson2 /></span><b>Import JSON</b><small>Create the Production, roles and ordered Drafts from one document.</small></button>
        </div>
      </>}
      {path === "empty" && <>
        <form id="create-production-form" className="resource-create-fields" onSubmit={(event) => { event.preventDefault(); void createEmpty() }}>
          <label><span>Title</span><Input autoFocus value={name} maxLength={160} placeholder="Production title" onChange={(event) => setName(event.target.value)} /></label>
          <label><span>Description <small>optional</small></span><Textarea value={description} maxLength={2000} placeholder="What is this Production for?" onChange={(event) => setDescription(event.target.value)} /></label>
          {parents.length > 1 && <label><span>Location</span><Select value={parentId} onValueChange={setParentId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{parents.map((item) => <SelectItem value={String(item.id)} key={`${item.type}:${item.id}`}>{item.type === "series" ? "Series" : "Project"} · {item.name}</SelectItem>)}</SelectContent></Select></label>}
        </form>
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setPath("choose")}>Back</Button><ActionButton type="submit" form="create-production-form" busy={saving} busyLabel="Creating…" disabled={!name.trim()}>Create Production</ActionButton></DialogFooter>
      </>}
      {path === "import" && parent && <ProductionImportTool newParent={parent} config={voices.config} directory={voices.directory} playingKey={player.source?.key} playerPlaying={player.state === "playing"} onPlay={(source) => void player.toggleSource(source)} onCancel={() => setPath("choose")} onCompleted={onCreated} />}
      {path === "choose" && <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button></DialogFooter>}
    </DialogContent>
  </Dialog>
}
