import { Clapperboard } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { ActionButton } from "@/components/operator-action"
import { Input } from "@/components/ui/input"
import { useAsyncAction } from "@/hooks/use-async-action"
import { studioApi } from "@/lib/api"
import type { SettingsSnapshot } from "@/types/domain"

export function DirectorProviderSettingsCard({ settings, onUpdated }: {
  settings: SettingsSnapshot
  onUpdated: (next: SettingsSnapshot) => void
}) {
  const [baseUrl, setBaseUrl] = useState(settings.director_provider.base_url)
  const [key, setKey] = useState("")
  const actions = useAsyncAction<"save" | "test">()
  const changed = useMemo(() => baseUrl.trim().replace(/\/$/, "") !== settings.director_provider.base_url || Boolean(key.trim()), [baseUrl, key, settings.director_provider.base_url])

  const save = () => actions.run("save", async () => {
    try {
      const next = await studioApi.updateKieSettings({ api_key: key, base_url: baseUrl })
      onUpdated(next)
      setKey("")
      toast.success("KIE connection saved.")
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "KIE settings could not be saved.")
    }
  })

  const test = () => actions.run("test", async () => {
    try {
      const result = await studioApi.testKieConnection()
      if (result.connected) toast.success("KIE accepted the saved connection.")
      else toast.error(result.reason || "KIE connection is not ready.")
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "KIE connection test failed.")
    }
  })

  return <section className="settings-card settings-wide">
    <header><Clapperboard /><div><h2>KIE Director connection</h2><p>Server-only credential used by enabled Kling and Seedance model adapters.</p></div></header>
    <div className="settings-form-grid">
      <label><span>API base</span><Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
      <label><span>API key</span><Input type="password" autoComplete="new-password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={settings.director_provider.configured ? "Configured — leave blank to keep" : "Enter KIE API key"} /></label>
    </div>
    <div className="settings-card-actions">
      <ActionButton variant="outline" busy={actions.isPending("save")} busyLabel="Saving connection…" disabled={actions.busy} onClick={() => void save()}>Save connection</ActionButton>
      <ActionButton variant="outline" busy={actions.isPending("test")} busyLabel="Testing connection…" disabled={actions.busy || changed} onClick={() => void test()}>Test connection</ActionButton>
      <small>{changed ? "Save these changes before testing." : "Checks the saved credential without generating media."}</small>
    </div>
  </section>
}
