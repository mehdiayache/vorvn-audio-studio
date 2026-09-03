import { History, Link2, LoaderCircle, Play } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { OperatorIconButton } from "@/components/operator-action"
import { audioUrl, originsApi } from "@/lib/api"
import { productIdentity } from "@/lib/product-identity"
import type { HistoricalVoiceReference, VoiceProfile } from "@/types/domain"

function historicalName(providerId: string) {
  const withoutHash = providerId.replace(/-[0-9a-f]{32}$/i, "")
  const label = withoutHash.replace(/^qwen.*?-tts-(?:plus|flash)-/i, "") || withoutHash
  return label.replace(/[_-]+/g, " ").replace(/([a-z])([0-9])/gi, "$1 $2").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function HistoricalVoicePanel({ profiles, onLinked, onPreview }: {
  profiles: VoiceProfile[]
  onLinked: () => void
  onPreview: (voice: HistoricalVoiceReference, label: string) => void
}) {
  const [items, setItems] = useState<HistoricalVoiceReference[]>([])
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState("")
  const active = useMemo(() => profiles.filter((profile) => profile.metadata.status !== "archived"), [profiles])

  async function refresh() {
    try { setItems(await originsApi.unlinkedVoiceHistory()) }
    catch { setItems([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])

  async function link(item: HistoricalVoiceReference) {
    const identityId = targets[item.provider_voice_id]
    const target = active.find((profile) => profile.id === identityId)
    if (!target) return
    const confirmed = window.confirm(`Link ${item.uses} existing recording${item.uses === 1 ? "" : "s"} to “${target.name}”?\n\nThis changes their voice label only. It does not regenerate audio or alter the provider voice.`)
    if (!confirmed) return
    setWorking(item.provider_voice_id)
    try {
      const result = await originsApi.linkVoiceHistory(target.id, item.provider_voice_id)
      toast.success(`${result.linked} recording${result.linked === 1 ? "" : "s"} linked to ${target.name}.`)
      await refresh(); onLinked()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Unable to link this history.")
    } finally { setWorking("") }
  }

  if (loading) return <section className="voice-history-panel loading"><LoaderCircle className="spin" /> Checking older recordings…</section>
  if (!items.length) return null
  return <details className="voice-history-panel">
    <summary><span><History /><span><b>Older cloned-voice history</b><small>{items.length} provider voice {items.length === 1 ? "reference needs" : "references need"} a human identity</small></span></span><span>{items.reduce((sum, item) => sum + item.uses, 0)} recordings</span></summary>
    <div className="voice-history-intro"><p>These recordings are safe and playable, but they were created before {productIdentity.name} had stable voice identities. Link only the ones you recognize.</p></div>
    <div className="voice-history-list">{items.map((item) => {
      const label = historicalName(item.provider_voice_id)
      return <article key={item.provider_voice_id}>
        <div className="voice-history-copy"><b>{label}</b><small>{item.uses} recording{item.uses === 1 ? "" : "s"} · {item.productions} production{item.productions === 1 ? "" : "s"} · last used {item.last_used ? new Date(item.last_used).toLocaleDateString() : "unknown"}</small><code title={item.provider_voice_id}>{item.provider_voice_id}</code></div>
        {item.preview_filename && <OperatorIconButton label={`Preview ${label}`} detail="Auditions the historical provider voice before linking it." size="icon" onClick={() => onPreview(item, label)}><Play /></OperatorIconButton>}
        <select aria-label={`Identity for ${label}`} value={targets[item.provider_voice_id] || ""} onChange={(event) => setTargets((current) => ({ ...current, [item.provider_voice_id]: event.target.value }))}>
          <option value="">Choose the matching voice…</option>
          {active.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}
        </select>
        <Button disabled={!targets[item.provider_voice_id] || Boolean(working)} onClick={() => void link(item)}>{working === item.provider_voice_id ? <LoaderCircle className="spin" /> : <Link2 />} Link history</Button>
      </article>
    })}</div>
  </details>
}
