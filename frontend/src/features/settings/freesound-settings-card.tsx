import { ExternalLink, Headphones } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAsyncAction } from "@/hooks/use-async-action"
import { originsApi } from "@/lib/api"
import type { SettingsSnapshot } from "@/types/domain"

export function FreesoundSettingsCard({ settings, onUpdated }: {
  settings: SettingsSnapshot
  onUpdated: (next: SettingsSnapshot) => void
}) {
  const [apiToken, setApiToken] = useState("")
  const [clientId, setClientId] = useState("")
  const [authorizationCode, setAuthorizationCode] = useState("")
  const action = useAsyncAction<"save">()
  const save = () => action.run("save", async () => {
    try {
      const next = await originsApi.updateFreesoundSettings({
        api_token: apiToken, client_id: clientId,
        authorization_code: authorizationCode,
      })
      onUpdated(next); setApiToken(""); setClientId(""); setAuthorizationCode("")
      toast.success(authorizationCode.trim() ? "Freesound connected." : "Freesound credentials saved.")
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Freesound settings could not be saved.")
    }
  })
  const hasCredentials = settings.audio_catalog.oauth_client_configured
  return <section className="settings-card settings-wide"><header><Headphones /><div><h2>Freesound catalog</h2><p>Search uses your API credential. Original downloads use renewable OAuth access, so Keep does not silently expire after one day.</p></div></header>
    <div className="settings-form-grid"><label><span>Client ID</span><Input autoComplete="off" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder={hasCredentials ? "Configured — leave blank to keep" : "Freesound Client ID"} /></label><label><span>API token / client secret</span><Input type="password" autoComplete="new-password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder={settings.audio_catalog.search_configured ? "Configured — leave blank to keep" : "Required for Search and OAuth"} /></label></div>
    {hasCredentials && !settings.audio_catalog.keep_configured && <div className="settings-form-grid"><div className="settings-oauth-step"><span>Authorize original downloads</span><Button asChild variant="outline"><a href={settings.audio_catalog.authorization_url} target="_blank" rel="noreferrer"><ExternalLink />Authorize on Freesound</a></Button></div><label><span>Authorization code</span><Input autoComplete="off" value={authorizationCode} onChange={(event) => setAuthorizationCode(event.target.value)} placeholder="Paste the one-time code" /></label></div>}
    <div className="settings-card-actions"><ActionButton variant="outline" busy={action.isPending("save")} busyLabel={authorizationCode.trim() ? "Connecting Freesound…" : "Saving Freesound…"} disabled={action.busy || (!apiToken.trim() && !clientId.trim() && !authorizationCode.trim())} onClick={() => void save()}>{authorizationCode.trim() ? "Connect Freesound" : "Save credentials"}</ActionButton><small>Search: {settings.audio_catalog.search_configured ? "ready" : "needs credentials"} · Keep originals: {settings.audio_catalog.keep_configured ? "ready" : settings.audio_catalog.keep_reason} Secrets are never returned.</small></div>
  </section>
}
