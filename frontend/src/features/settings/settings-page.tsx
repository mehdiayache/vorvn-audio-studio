import { Database, FolderOpen, Gauge, Save, Server, SlidersHorizontal } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ErrorState, PageLoading } from "@/components/state-panel"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { studioApi } from "@/lib/api"
import type { SettingsSnapshot } from "@/types/domain"

import "./settings-page.css"
import "./settings-admin.css"
import { AdvancedSettingsCard } from "./advanced-settings-card"
import { MaintenanceSettingsCard } from "./maintenance-settings-card"
import { PronunciationSettingsCard } from "./pronunciation-settings-card"
import { ProviderSettingsCard } from "./provider-settings-card"
import { StorageSettingsCard } from "./storage-settings-card"

function statusText(value: Record<string, unknown>) {
  if (typeof value.status === "string") return value.status
  if (typeof value.connected === "boolean") return value.connected ? "Connected" : "Unavailable"
  if (typeof value.configured === "boolean") return value.configured ? "Configured" : "Needs setup"
  return "Available"
}

export function SettingsPage() {
  const [data, setData] = useState<SettingsSnapshot | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [warnAbove, setWarnAbove] = useState("0")
  const [dailyCap, setDailyCap] = useState("0")
  const [fixDates, setFixDates] = useState(true)
  const [dayFirst, setDayFirst] = useState(true)

  const load = async () => {
    setError("")
    try {
      const next = await studioApi.settings()
      setData(next)
      setWarnAbove(String(next.spending.warn_above))
      setDailyCap(String(next.spending.daily_cap))
      setFixDates(next.speech.fix_dates_phones)
      setDayFirst(next.speech.day_first)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Settings could not be loaded.")
    }
  }

  useEffect(() => { void load() }, [])

  const save = async () => {
    setSaving(true)
    try {
      const next = await studioApi.updateSettings({
        warn_above: Number(warnAbove),
        daily_cap: Number(dailyCap),
        fix_dates_phones: fixDates,
        day_first: dayFirst,
      })
      setData(next)
      toast.success("Audio Studio settings saved.")
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Settings could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  if (!data && !error) return <PageLoading label="Loading settings" />
  if (!data) return <ErrorState title="Settings unavailable" message={error} retry={() => void load()} />

  return <main className="settings-page">
    <header className="settings-hero"><div><span className="eyebrow">Audio Studio</span><h1>Settings</h1><p>Connection, storage and production defaults used by every tool.</p></div><Button onClick={() => void save()} disabled={saving}><Save />{saving ? "Saving…" : "Save general settings"}</Button></header>

    <section className="settings-status-grid" aria-label="System status">
      <article><Server /><div><b>Alibaba</b><span>{data.provider.configured ? `Connected · ${data.provider.region_label}` : "API key needed"}</span></div><i className={data.provider.configured ? "healthy" : "warning"} /></article>
      <article><Database /><div><b>Database</b><span>{statusText(data.database)}</span></div><i className={data.database.connected ? "healthy" : "warning"} /></article>
      <article><FolderOpen /><div><b>Reference storage</b><span>{statusText(data.storage)}</span></div><i className={data.storage.configured ? "healthy" : "warning"} /></article>
    </section>

    <div className="settings-grid">
      <section className="settings-card settings-wide"><header><FolderOpen /><div><h2>Finished audio</h2><p>One stable media root protects existing recordings. Change it through deployment configuration before startup.</p></div></header><label><span>Media root</span><Input value={data.output_directory} readOnly aria-readonly="true" /></label><small>Set AUDIO_STUDIO_OUTPUT_DIR when deploying or moving the complete media library.</small></section>

      <section className="settings-card"><header><Gauge /><div><h2>Spending guardrails</h2><p>Warnings inform the operator; a non-zero daily cap blocks new paid work.</p></div></header><div className="settings-pair"><label><span>Warn above (USD)</span><Input type="number" min="0" step="0.01" value={warnAbove} onChange={(event) => setWarnAbove(event.target.value)} /></label><label><span>Daily cap (USD)</span><Input type="number" min="0" step="0.01" value={dailyCap} onChange={(event) => setDailyCap(event.target.value)} /></label></div><small>${Number(data.spending.today || 0).toFixed(4)} recorded today · ${Number(data.spending.month || 0).toFixed(4)} this month</small></section>

      <section className="settings-card"><header><SlidersHorizontal /><div><h2>Text interpretation</h2><p>Applied before synthesis to avoid ambiguous dates and phone numbers.</p></div></header><label className="settings-check"><Checkbox checked={fixDates} onCheckedChange={(value) => setFixDates(Boolean(value))} /><span><b>Normalize dates and phone numbers</b><small>Preserves natural spoken output.</small></span></label><label className="settings-check"><Checkbox checked={dayFirst} disabled={!fixDates} onCheckedChange={(value) => setDayFirst(Boolean(value))} /><span><b>Use day-first dates</b><small>3/4/2026 is read as 3 April.</small></span></label></section>

      <ProviderSettingsCard settings={data} onUpdated={setData} />
      <StorageSettingsCard settings={data} onUpdated={setData} />
      <PronunciationSettingsCard />
      <AdvancedSettingsCard settings={data} onUpdated={setData} />
      <MaintenanceSettingsCard />
    </div>
  </main>
}
