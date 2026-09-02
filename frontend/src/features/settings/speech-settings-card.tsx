import { Save, SlidersHorizontal } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { originsApi } from "@/lib/api"
import type { SettingsSnapshot } from "@/types/domain"

export function SpeechSettingsCard({ settings, onUpdated }: { settings: SettingsSnapshot; onUpdated: (settings: SettingsSnapshot) => void }) {
  const [fixDates, setFixDates] = useState(settings.speech.fix_dates_phones)
  const [dayFirst, setDayFirst] = useState(settings.speech.day_first)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setFixDates(settings.speech.fix_dates_phones); setDayFirst(settings.speech.day_first) }, [settings.speech.day_first, settings.speech.fix_dates_phones])
  const dirty = fixDates !== settings.speech.fix_dates_phones || dayFirst !== settings.speech.day_first
  async function save() {
    setSaving(true)
    try {
      onUpdated(await originsApi.updateSettings({ fix_dates_phones: fixDates, day_first: dayFirst }))
      toast.success("Speech interpretation saved.")
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Speech interpretation could not be saved.") }
    finally { setSaving(false) }
  }
  return <section className="settings-card"><header><SlidersHorizontal /><div><h2>Speech interpretation</h2><p>Applied before synthesis to avoid ambiguous dates and phone numbers.</p></div></header><label className="settings-check"><Checkbox checked={fixDates} onCheckedChange={(value) => setFixDates(Boolean(value))} /><span><b>Normalize dates and phone numbers</b><small>Preserves natural spoken output.</small></span></label><label className="settings-check"><Checkbox checked={dayFirst} disabled={!fixDates} onCheckedChange={(value) => setDayFirst(Boolean(value))} /><span><b>Use day-first dates</b><small>3/4/2026 is read as 3 April.</small></span></label><footer className="settings-save-boundary"><span>{dirty ? "Unsaved changes" : "Saved"}</span><Button size="sm" disabled={!dirty || saving} onClick={() => void save()}><Save />{saving ? "Saving…" : "Save interpretation"}</Button></footer></section>
}
