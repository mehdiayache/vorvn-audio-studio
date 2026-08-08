import { FileCog, RotateCcw, SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { studioApi } from "@/lib/api"
import type { SettingsSnapshot } from "@/types/domain"

export function AdvancedSettingsCard({ settings, onUpdated }: { settings: SettingsSnapshot; onUpdated: (next: SettingsSnapshot) => void }) {
  const [flags, setFlags] = useState(settings.speech.synth_flags)
  const [extra, setExtra] = useState(settings.speech.extra_params)
  const [naming, setNaming] = useState(settings.naming)
  const save = async () => { try { onUpdated(await studioApi.updateSettings({ synth_flags: flags, extra_params: extra, naming })); toast.success("Advanced defaults saved.") } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Advanced settings could not be saved.") } }
  return <section className="settings-card settings-wide"><header><SlidersHorizontal /><div><h2>Synthesis and file naming</h2><p>Expert defaults shared by every compatible tool. Unsupported provider options are ignored by the provider adapter.</p></div></header><div className="settings-subsection"><h3>Synthesis flags</h3><div className="settings-flags">{Object.entries(settings.speech.supported_flags).map(([key, label]) => <label className="settings-check" key={key}><Checkbox checked={Boolean(flags[key])} onCheckedChange={(value) => setFlags({ ...flags, [key]: Boolean(value) })} /><span><b>{label}</b><small>{key}</small></span></label>)}</div><label><span>Additional provider parameters (JSON)</span><Textarea value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="{}" /></label></div><div className="settings-subsection"><h3><FileCog /> Download names and audio tags</h3><div className="settings-form-grid">{Object.entries(naming).map(([key, value]) => typeof value === "boolean" ? <label className="settings-check" key={key}><Checkbox checked={value} onCheckedChange={(checked) => setNaming({ ...naming, [key]: Boolean(checked) })} /><span><b>{key.replaceAll("_", " ")}</b></span></label> : <label key={key}><span>{key.replaceAll("_", " ")}</span><Input type={typeof value === "number" ? "number" : "text"} value={String(value ?? "")} onChange={(event) => setNaming({ ...naming, [key]: typeof value === "number" ? Number(event.target.value) : event.target.value })} /></label>)}</div><small>Available tokens: {settings.naming_tokens.map((token) => `{${token}}`).join(", ")}</small></div><div className="settings-card-actions"><Button variant="outline" onClick={() => void save()}>Save advanced defaults</Button><Button variant="ghost" onClick={async () => { const next = await studioApi.resetNaming(); onUpdated(next); setNaming(next.naming); toast.success("Naming defaults restored.") }}><RotateCcw /> Reset naming</Button></div></section>
}
