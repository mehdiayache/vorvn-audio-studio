import { FileAudio2, Plus, Settings2, Trash2, Unlink, UserRound } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DeleteProductionDialog } from "@/components/delete-production-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"
import { studioApi } from "@/lib/api"
import type { ProductionSummary, SeriesOverview } from "@/types/domain"
import { CreateResourceDialog } from "./create-resource-dialog"
import { ResourceManage } from "./resource-manage"
import {
  DropdownMenuItem, ProductionMenu, ProductionRow, WorkCollectionToolbar,
  WorkEmpty, WorkPageHeader, WorkSection, type WorkSort,
} from "./work-primitives"
import "./work.css"

const noPreference = "__none__"

export function SeriesPage({ data, refresh }: { data: SeriesOverview; refresh: () => void }) {
  const [creating, setCreating] = useState(false)
  const [editingDefaults, setEditingDefaults] = useState(false)
  const [language, setLanguage] = useState(String(data.defaults.language || ""))
  const [voiceIdentityId, setVoiceIdentityId] = useState(String(data.defaults.voice_identity_id || ""))
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [deleting, setDeleting] = useState<ProductionSummary | null>(null)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<WorkSort>("updated")
  const voices = useVoiceDirectory()
  const series = data.resource
  const parent = { id: series.id, type: "series" as const, name: series.name }
  const identities = useMemo(() => (voices.directory.identities || []).filter((identity) => identity.metadata.status !== "archived"), [voices.directory.identities])
  const preferredVoice = identities.find((identity) => identity.id === voiceIdentityId)
  const productions = useMemo(() => data.productions.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "duration" ? b.duration_ms - a.duration_ms : String(b.updated_at || "").localeCompare(String(a.updated_at || ""))), [data.productions, query, sort])

  useEffect(() => { if (!editingDefaults) { setLanguage(String(data.defaults.language || "")); setVoiceIdentityId(String(data.defaults.voice_identity_id || "")) } }, [data.defaults, editingDefaults])

  async function makeStandalone(id: number, name: string) {
    try { await studioApi.moveProduction(id, null); refresh(); toast.success(`${name} now lives directly in its Project.`) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to move this Production.") }
  }
  async function saveDefaults() {
    setSavingDefaults(true)
    try { await studioApi.updateResource("series", series.id, { defaults: { language: language.trim(), voice_identity_id: voiceIdentityId } }); setEditingDefaults(false); refresh(); toast.success("Series preferences updated.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update Series preferences.") }
    finally { setSavingDefaults(false) }
  }

  return <main className="work-page">
    <WorkPageHeader kind="Series" name={series.name} description={series.description} trail={data.trail} metrics={data.metrics} icon={series.icon} actions={<><Button variant="outline" onClick={() => setEditingDefaults(true)}><Settings2 /> Preferences</Button><ResourceManage kind="series" id={series.id} name={series.name} description={series.description} onUpdated={refresh} /><Button onClick={() => setCreating(true)}><Plus /> New Production</Button></>} />
    <div className="work-content series-catalog-view">
      <div className="series-preference-line"><span><b>Editorial defaults</b><small><span>{preferredVoice?.name || "Any voice"}</span><span>{language || "Any language"}</span></small></span><Button variant="ghost" size="sm" onClick={() => setEditingDefaults(true)}>Change</Button></div>
      <WorkSection title="Productions" description="Episodes and releases in this Series." count={data.productions.length}>
        <WorkCollectionToolbar query={query} onQueryChange={setQuery} sort={sort} onSortChange={setSort} placeholder="Find a Production" resultCount={productions.length} actions={<Button size="sm" onClick={() => setCreating(true)}><Plus /> New Production</Button>} />
        {productions.length ? <div className="production-summary-list">{productions.map((production) => <ProductionRow production={production} key={production.id} menu={<ProductionMenu label={`Actions for ${production.name}`}><DropdownMenuItem onSelect={() => void makeStandalone(production.id, production.name)}><Unlink /> Move directly to Project</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => setDeleting(production)}><Trash2 /> Delete Production permanently</DropdownMenuItem></ProductionMenu>} />)}</div> : <WorkEmpty icon={<FileAudio2 />} title={query ? "No matching Productions" : "No Productions yet"} description={query ? "Try another name or clear the search." : "Create the first Production in this Series."} action={query ? <Button variant="outline" onClick={() => setQuery("")}>Clear search</Button> : <Button onClick={() => setCreating(true)}><Plus /> New Production</Button>} />}
      </WorkSection>
    </div>
    <CreateResourceDialog kind="production" parent={parent} productionParents={[parent]} open={creating} onOpenChange={setCreating} onCreated={refresh} />
    <DeleteProductionDialog production={deleting} open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }} onDeleted={() => { setDeleting(null); refresh() }} />
    <Dialog open={editingDefaults} onOpenChange={(open) => { if (!savingDefaults) setEditingDefaults(open) }}><DialogContent><DialogHeader><DialogTitle>Series preferences</DialogTitle><DialogDescription>Optional editorial prefills. The operator still chooses the exact recording method.</DialogDescription></DialogHeader><div className="resource-create-fields"><label><span>Preferred Voice Identity <small>optional</small></span><Select value={voiceIdentityId || noPreference} onValueChange={(value) => setVoiceIdentityId(value === noPreference ? "" : value)}><SelectTrigger className="w-full"><SelectValue placeholder="No preferred voice" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value={noPreference}>No preferred voice</SelectItem>{voiceIdentityId && !preferredVoice && <SelectItem value={voiceIdentityId} disabled>Unavailable voice ({voiceIdentityId})</SelectItem>}{identities.map((identity) => <SelectItem key={identity.id} value={identity.id}><UserRound /> {identity.name}</SelectItem>)}</SelectGroup></SelectContent></Select>{voices.error && <small className="field-error">Voice Library unavailable: {voices.error}</small>}</label><label><span>Output language preference <small>optional</small></span><Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="e.g. Arabic" /><small>The Composer may prefill this value. It never limits the Voice Identity.</small></label></div><DialogFooter><Button variant="outline" disabled={savingDefaults} onClick={() => setEditingDefaults(false)}>Cancel</Button><Button disabled={savingDefaults} onClick={() => void saveDefaults()}>{savingDefaults ? "Saving…" : "Save preferences"}</Button></DialogFooter></DialogContent></Dialog>
  </main>
}
