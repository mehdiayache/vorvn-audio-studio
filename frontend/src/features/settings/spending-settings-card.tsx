import { Gauge, Save } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { originsApi } from "@/lib/api"
import type { SettingsSnapshot } from "@/types/domain"

export function SpendingSettingsCard({ settings, onUpdated }: { settings: SettingsSnapshot; onUpdated: (settings: SettingsSnapshot) => void }) {
  const [warnAbove, setWarnAbove] = useState(String(settings.spending.warn_above))
  const [dailyCap, setDailyCap] = useState(String(settings.spending.daily_cap))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setWarnAbove(String(settings.spending.warn_above)); setDailyCap(String(settings.spending.daily_cap)) }, [settings.spending.daily_cap, settings.spending.warn_above])
  const dirty = Number(warnAbove) !== Number(settings.spending.warn_above) || Number(dailyCap) !== Number(settings.spending.daily_cap)
  async function save() {
    setSaving(true)
    try {
      onUpdated(await originsApi.updateSettings({ warn_above: Number(warnAbove), daily_cap: Number(dailyCap) }))
      toast.success("Spending guardrails saved.")
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Spending guardrails could not be saved.") }
    finally { setSaving(false) }
  }
  return <section className="settings-card"><header><Gauge /><div><h2>Spending guardrails</h2><p>Warnings inform the operator; a non-zero daily cap blocks new paid work.</p></div></header><div className="settings-pair"><label><span>Warn above (USD)</span><Input type="number" min="0" step="0.01" value={warnAbove} onChange={(event) => setWarnAbove(event.target.value)} /></label><label><span>Daily cap (USD)</span><Input type="number" min="0" step="0.01" value={dailyCap} onChange={(event) => setDailyCap(event.target.value)} /></label></div><small>${Number(settings.spending.today || 0).toFixed(4)} recorded today · ${Number(settings.spending.month || 0).toFixed(4)} this month</small><footer className="settings-save-boundary"><span>{dirty ? "Unsaved changes" : "Saved"}</span><Button size="sm" disabled={!dirty || saving} onClick={() => void save()}><Save />{saving ? "Saving…" : "Save guardrails"}</Button></footer></section>
}
