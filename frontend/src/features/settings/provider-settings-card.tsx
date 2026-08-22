import { Server } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { ActionButton } from "@/components/operator-action"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAsyncAction } from "@/hooks/use-async-action"
import { studioApi } from "@/lib/api"
import type { SettingsSnapshot } from "@/types/domain"

export function ProviderSettingsCard({ settings, onUpdated }: { settings: SettingsSnapshot; onUpdated: (next: SettingsSnapshot) => void }) {
  const [region, setRegion] = useState(settings.provider.region)
  const [workspace, setWorkspace] = useState(settings.provider.workspace_id || "")
  const [key, setKey] = useState("")
  const actions = useAsyncAction<"save" | "test">()
  const hasUnsavedChanges = useMemo(() => region !== settings.provider.region || workspace.trim() !== (settings.provider.workspace_id || "") || Boolean(key.trim()), [key, region, settings.provider.region, settings.provider.workspace_id, workspace])
  const save = () => actions.run("save", async () => { try { const next = await studioApi.updateProviderSettings({ region, workspace_id: workspace, api_key: key }); onUpdated(next); setKey(""); toast.success("Alibaba connection saved.") } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Provider settings could not be saved.") } })
  const test = () => actions.run("test", async () => { try { const result = await studioApi.testAlibabaConnection(); if (result.connected) toast.success(`Alibaba accepted the saved ${result.region_label} connection.`); else toast.error(result.reason || "Alibaba connection is not ready.") } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Alibaba connection test failed.") } })
  return <section className="settings-card settings-wide"><header><Server /><div><h2>Alibaba connection</h2><p>Region, Workspace and secret used by every Alibaba model. Changing region changes which cloned voices exist.</p></div></header>
    <div className="settings-form-grid"><label><span>Region</span><Select value={region} onValueChange={setRegion}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="intl">Singapore (international)</SelectItem><SelectItem value="beijing">Beijing (China)</SelectItem></SelectContent></Select></label><label><span>Workspace ID</span><Input value={workspace} onChange={(event) => setWorkspace(event.target.value)} placeholder="Optional default workspace" /></label><label className="settings-span"><span>API key</span><Input type="password" autoComplete="new-password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={settings.provider.configured ? "Configured — leave blank to keep" : "Enter DashScope API key"} /></label></div>
    <div className="settings-card-actions"><ActionButton variant="outline" busy={actions.isPending("save")} busyLabel="Saving connection…" disabled={actions.busy} onClick={() => void save()}>Save connection</ActionButton><ActionButton variant="outline" busy={actions.isPending("test")} busyLabel="Testing connection…" disabled={actions.busy || hasUnsavedChanges} onClick={() => void test()}>Test connection</ActionButton><small>{hasUnsavedChanges ? "Save these changes before testing." : "Tests the saved connection without generating audio. Secrets are never returned."}</small></div>
  </section>
}
