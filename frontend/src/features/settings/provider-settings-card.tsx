import { Server } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { studioApi } from "@/lib/api"
import type { SettingsSnapshot } from "@/types/domain"

export function ProviderSettingsCard({ settings, onUpdated }: { settings: SettingsSnapshot; onUpdated: (next: SettingsSnapshot) => void }) {
  const [region, setRegion] = useState(settings.provider.region)
  const [workspace, setWorkspace] = useState(settings.provider.workspace_id || "")
  const [key, setKey] = useState("")
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try { const next = await studioApi.updateProviderSettings({ region, workspace_id: workspace, api_key: key }); onUpdated(next); setKey(""); toast.success("Alibaba connection saved.") }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "Provider settings could not be saved.") }
    finally { setSaving(false) }
  }
  return <section className="settings-card settings-wide"><header><Server /><div><h2>Alibaba connection</h2><p>Region, Workspace and secret used by every Alibaba model. Changing region changes which cloned voices exist.</p></div></header>
    <div className="settings-form-grid"><label><span>Region</span><Select value={region} onValueChange={setRegion}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="intl">Singapore (international)</SelectItem><SelectItem value="beijing">Beijing (China)</SelectItem></SelectContent></Select></label><label><span>Workspace ID</span><Input value={workspace} onChange={(event) => setWorkspace(event.target.value)} placeholder="Optional default workspace" /></label><label className="settings-span"><span>API key</span><Input type="password" autoComplete="new-password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={settings.provider.configured ? "Configured — leave blank to keep" : "Enter DashScope API key"} /></label></div>
    <div className="settings-card-actions"><Button variant="outline" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save connection"}</Button><small>Secrets are accepted by the server but never returned to this page.</small></div>
  </section>
}
