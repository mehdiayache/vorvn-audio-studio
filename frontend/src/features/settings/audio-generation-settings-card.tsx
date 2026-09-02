import { Sparkles } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ActionButton } from "@/components/operator-action"
import { Input } from "@/components/ui/input"
import { useAsyncAction } from "@/hooks/use-async-action"
import { originsApi } from "@/lib/api"
import type { SettingsSnapshot } from "@/types/domain"

export function AudioGenerationSettingsCard({ settings, onUpdated }: {
  settings: SettingsSnapshot
  onUpdated: (next: SettingsSnapshot) => void
}) {
  const [apiKey, setApiKey] = useState("")
  const action = useAsyncAction<"save">()
  const save = () => action.run("save", async () => {
    try {
      const next = await originsApi.updateAudioGenerationSettings({ api_key: apiKey, base_url: "" })
      onUpdated(next); setApiKey("")
      toast.success("Audio Generation connection saved.")
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Audio Generation settings could not be saved.")
    }
  })
  return <section className="settings-card settings-wide"><header><Sparkles /><div><h2>Audio Generation</h2><p>Private Sound Effect and Music generation for temporary candidates. Saving a reusable File is always explicit.</p></div></header>
    <label><span>VORVN Audio API key</span><Input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.audio_generation.configured ? "Configured — leave blank to keep" : "Required for Generate"} /></label>
    <div className="settings-card-actions"><ActionButton variant="outline" busy={action.isPending("save")} busyLabel="Saving Audio Generation…" disabled={action.busy || !apiKey.trim()} onClick={() => void save()}>Save Audio Generation</ActionButton><small>{settings.audio_generation.configured ? "Key saved. Live Sound Effect and Music readiness is checked in Generate." : "Add the key to enable Generate."} The secret is never returned.</small></div>
  </section>
}
