import { FileAudio2, Plus, Settings2, Unlink } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { studioApi } from "@/lib/api"
import type { SeriesOverview } from "@/types/domain"
import { CreateResourceDialog } from "./create-resource-dialog"
import { ResourceManage } from "./resource-manage"
import { DropdownMenuItem, ProductionMenu, ProductionRow, WorkPageHeader, WorkSection } from "./work-primitives"

function readableDefaults(defaults: Record<string, unknown>) {
  return Object.entries(defaults).filter(([, value]) => value !== null && value !== "" && ["string", "number", "boolean"].includes(typeof value)).slice(0, 6)
}

export function SeriesPage({ data, refresh }: { data: SeriesOverview; refresh: () => void }) {
  const [creating, setCreating] = useState(false)
  const [editingDefaults, setEditingDefaults] = useState(false)
  const [language, setLanguage] = useState(String(data.defaults.language || ""))
  const [voice, setVoice] = useState(String(data.defaults.voice || ""))
  const [speechMode, setSpeechMode] = useState(String(data.defaults.speech_mode || ""))
  const [savingDefaults, setSavingDefaults] = useState(false)
  const series = data.resource
  const parent = { id: series.id, type: "series" as const, name: series.name }
  async function makeStandalone(id: number, name: string) {
    try { await studioApi.moveProduction(id, null); refresh(); toast.success(`${name} is now standalone.`) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to move this Production.") }
  }
  async function saveDefaults() {
    setSavingDefaults(true)
    try { await studioApi.updateResource("series", series.id, { defaults: { ...data.defaults, language: language.trim(), voice: voice.trim(), speech_mode: speechMode.trim() } }); setEditingDefaults(false); refresh(); toast.success("Series defaults updated.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update Series defaults.") }
    finally { setSavingDefaults(false) }
  }
  const defaults = readableDefaults(data.defaults)
  return <main className="work-page">
    <WorkPageHeader kind="Series" name={series.name} description={series.description} trail={data.trail} metrics={data.metrics} actions={<><ResourceManage kind="series" id={series.id} name={series.name} description={series.description} onUpdated={refresh} /><Button onClick={() => setCreating(true)}><Plus /> New Production</Button></>} />
    <div className="work-content series-layout">
      <aside className="series-defaults"><h2>Defaults</h2><p>Used when creating a Production in this Series.</p>{defaults.length ? <dl>{defaults.map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>)}</dl> : <div className="defaults-empty">No defaults.</div>}<Button variant="outline" className="series-defaults-edit" onClick={() => setEditingDefaults(true)}><Settings2 /> Edit defaults</Button></aside>
      <WorkSection title="Productions" action={<Button onClick={() => setCreating(true)}><Plus /> New Production</Button>}>
        {data.productions.length ? <div className="production-summary-list">{data.productions.map((production, index) => <div className="series-production-item" key={production.id}><span className="series-order">{String(index + 1).padStart(2, "0")}</span><ProductionRow production={production} menu={<ProductionMenu label={`Actions for ${production.name}`}><DropdownMenuItem onSelect={() => void makeStandalone(production.id, production.name)}><Unlink /> Make standalone</DropdownMenuItem></ProductionMenu>} /></div>)}</div> : <div className="work-empty compact"><FileAudio2 /><h3>No Productions</h3><Button onClick={() => setCreating(true)}><Plus /> New Production</Button></div>}
      </WorkSection>
    </div>
    <CreateResourceDialog kind="production" parent={parent} open={creating} onOpenChange={setCreating} onCreated={refresh} />
    <Dialog open={editingDefaults} onOpenChange={(open) => { if (!savingDefaults) setEditingDefaults(open) }}><DialogContent><DialogHeader><DialogTitle>Series defaults</DialogTitle><DialogDescription>Applied to new Productions in this Series.</DialogDescription></DialogHeader><div className="resource-create-fields"><label><span>Language</span><Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="e.g. Arabic" /></label><label><span>Voice</span><Input value={voice} onChange={(event) => setVoice(event.target.value)} placeholder="Friendly voice name" /></label><label><span>Reading mode</span><Input value={speechMode} onChange={(event) => setSpeechMode(event.target.value)} placeholder="exact or directed" /></label></div><DialogFooter><Button variant="outline" disabled={savingDefaults} onClick={() => setEditingDefaults(false)}>Cancel</Button><Button disabled={savingDefaults} onClick={() => void saveDefaults()}>{savingDefaults ? "Saving…" : "Save defaults"}</Button></DialogFooter></DialogContent></Dialog>
  </main>
}
