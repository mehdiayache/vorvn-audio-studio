import { Database, FolderOpen, Server } from "lucide-react"
import { useEffect, useState } from "react"

import { ErrorState, PageLoading } from "@/components/state-panel"
import { Input } from "@/components/ui/input"
import { StudioPageHeader } from "@/components/studio-page-header"
import { studioApi } from "@/lib/api"
import { productIdentity } from "@/lib/product-identity"
import type { SettingsSnapshot } from "@/types/domain"

import "./settings-page.css"
import "./settings-admin.css"
import { AdvancedSettingsCard } from "./advanced-settings-card"
import { MaintenanceSettingsCard } from "./maintenance-settings-card"
import { PronunciationSettingsCard } from "./pronunciation-settings-card"
import { ProviderSettingsCard } from "./provider-settings-card"
import { StorageSettingsCard } from "./storage-settings-card"
import { SpendingSettingsCard } from "./spending-settings-card"
import { SpeechSettingsCard } from "./speech-settings-card"
import { FreesoundSettingsCard } from "./freesound-settings-card"
import { AudioGenerationSettingsCard } from "./audio-generation-settings-card"

function statusText(value: Record<string, unknown>) {
  if (typeof value.status === "string") return value.status
  if (typeof value.connected === "boolean") return value.connected ? "Connected" : "Unavailable"
  if (typeof value.configured === "boolean") return value.configured ? "Configured" : "Needs setup"
  return "Available"
}

export function SettingsPage() {
  const [data, setData] = useState<SettingsSnapshot | null>(null)
  const [error, setError] = useState("")

  const load = async () => {
    setError("")
    try {
      const next = await studioApi.settings()
      setData(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Settings could not be loaded.")
    }
  }

  useEffect(() => { void load() }, [])

  if (!data && !error) return <PageLoading label="Loading settings" />
  if (!data) return <ErrorState title="Settings unavailable" message={error} retry={() => void load()} />

  return <main className="settings-page">
    <StudioPageHeader eyebrow={productIdentity.name} title="Settings" description="Connection, storage and production defaults used by every tool. Each section saves only its own changes." />

    <section className="settings-readiness" aria-labelledby="product-readiness-title"><header><h2 id="product-readiness-title">Product readiness</h2><p>Live application, provider and durable storage status.</p></header><div className="settings-status-grid">
      <article><Server /><div><b>{productIdentity.name}</b><span>{data.database.connected ? data.provider.configured ? "Ready" : "Setup required" : `${productIdentity.name} unavailable`}</span></div><i className={data.database.connected && data.provider.configured ? "healthy" : "warning"} /></article>
      <article><Server /><div><b>Alibaba</b><span>{data.provider.configured ? `Connected · ${data.provider.region_label}` : "API key needed"}</span></div><i className={data.provider.configured ? "healthy" : "warning"} /></article>
      <article><Database /><div><b>Database</b><span>{statusText(data.database)}</span></div><i className={data.database.connected ? "healthy" : "warning"} /></article>
      <article><FolderOpen /><div><b>Reference storage</b><span>{statusText(data.storage)}</span></div><i className={data.storage.configured ? "healthy" : "warning"} /></article>
    </div></section>

    <div className="settings-grid">
      <ProviderSettingsCard settings={data} onUpdated={setData} />
      <FreesoundSettingsCard settings={data} onUpdated={setData} />
      <AudioGenerationSettingsCard settings={data} onUpdated={setData} />
      <StorageSettingsCard settings={data} onUpdated={setData} />
      <section className="settings-card settings-wide"><header><FolderOpen /><div><h2>Finished audio</h2><p>One stable media root protects existing recordings. Change it through deployment configuration before startup.</p></div></header><label><span>Media root</span><Input value={data.output_directory} readOnly aria-readonly="true" /></label><small>Set AUDIO_STUDIO_OUTPUT_DIR when deploying or moving the complete media library.</small></section>

      <SpendingSettingsCard settings={data} onUpdated={setData} />
      <SpeechSettingsCard settings={data} onUpdated={setData} />
      <PronunciationSettingsCard />
      <MaintenanceSettingsCard />
      <AdvancedSettingsCard settings={data} onUpdated={setData} />
    </div>
  </main>
}
