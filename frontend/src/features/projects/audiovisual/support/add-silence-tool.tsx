import { Plus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function AddSilenceTool({ onAdd }: { onAdd: (seconds: number) => Promise<void> }) {
  const [seconds, setSeconds] = useState(2)
  const [saving, setSaving] = useState(false)
  return <div className="tool-panel-body silence-tool">
    <label><span>Duration</span><div className="seconds-input"><Input type="number" min={0.1} max={120} step={0.1} value={seconds} onChange={(event) => setSeconds(Number(event.target.value))} /><b>seconds</b></div></label>
    <div className="silence-presets">{[0.5, 1, 2, 4, 8].map((value) => <Button key={value} variant={seconds === value ? "secondary" : "outline"} onClick={() => setSeconds(value)}>{value}s</Button>)}</div>
    <p>Silence is a free timed part. You can edit its exact duration directly in the sequence later.</p>
    <Button disabled={saving} onClick={async () => { setSaving(true); try { await onAdd(Math.max(0.1, Math.min(120, seconds))) } finally { setSaving(false) } }}><Plus />{saving ? "Adding…" : `Add ${seconds} seconds`}</Button>
  </div>
}
