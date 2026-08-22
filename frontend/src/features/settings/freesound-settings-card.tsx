import { Headphones } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ActionButton } from "@/components/operator-action"
import { Input } from "@/components/ui/input"
import { useAsyncAction } from "@/hooks/use-async-action"
import { studioApi } from "@/lib/api"
import type { SettingsSnapshot } from "@/types/domain"

export function FreesoundSettingsCard({ settings, onUpdated }: {
  settings: SettingsSnapshot
  onUpdated: (next: SettingsSnapshot) => void
}) {
  const [apiToken, setApiToken] = useState("")
  const [oauthToken, setOauthToken] = useState("")
  const action = useAsyncAction<"save">()
  const save = () => action.run("save", async () => {
    try {
      const next = await studioApi.updateFreesoundSettings({
        api_token: apiToken, oauth_access_token: oauthToken,
      })
      onUpdated(next); setApiToken(""); setOauthToken("")
      toast.success("Freesound connection saved.")
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Freesound settings could not be saved.")
    }
  })
  return <section className="settings-card settings-wide"><header><Headphones /><div><h2>Freesound catalog</h2><p>Search uses the API token. Keep uses OAuth2 to download the original source before it enters your Audio Library.</p></div></header>
    <div className="settings-form-grid"><label><span>API token</span><Input type="password" autoComplete="new-password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder={settings.audio_catalog.search_configured ? "Configured — leave blank to keep" : "Required for Search"} /></label><label><span>OAuth2 access token</span><Input type="password" autoComplete="new-password" value={oauthToken} onChange={(event) => setOauthToken(event.target.value)} placeholder={settings.audio_catalog.keep_configured ? "Configured — leave blank to keep" : "Required for original-source Keep"} /></label></div>
    <div className="settings-card-actions"><ActionButton variant="outline" busy={action.isPending("save")} busyLabel="Saving Freesound…" disabled={action.busy || (!apiToken.trim() && !oauthToken.trim())} onClick={() => void save()}>Save Freesound</ActionButton><small>Search: {settings.audio_catalog.search_configured ? "ready" : "needs token"} · Keep originals: {settings.audio_catalog.keep_configured ? "ready" : "needs OAuth2"}. Secrets are never returned.</small></div>
  </section>
}
