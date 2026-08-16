import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { useComposer } from "./composer-controller"

function modeLabel(mode: string) {
  if (mode === "exact") return "Keep the script"
  if (mode === "directed") return "Add direction"
  return mode.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase())
}

export function ComposerPerformance() {
  const composer = useComposer()
  const controls = composer.capabilityControls
  const selectedPreset = composer.performancePresets.find((preset) => preset.instruction === composer.instruction)
  return <section className="composer-section">
    <header><div><span className="eyebrow">Sound</span><h3>Shape the delivery</h3></div></header>
    {controls.directionModes.length > 1 && <div className="delivery-mode"><div><span>Delivery</span>{controls.directionModes.map((mode) => <Button key={mode} variant={composer.deliveryMode === mode ? "secondary" : "outline"} onClick={() => composer.setDeliveryModeRequest(mode)}>{modeLabel(mode)}</Button>)}</div><p>{composer.deliveryMode === "exact" ? controls.exactHelp : controls.directedHelp}</p></div>}
    {composer.performancePresets.length > 0 && <label className="performance-preset-select"><span>Performance preset</span><Select value={selectedPreset?.id || "custom"} onValueChange={(value) => {
      const preset = composer.performancePresets.find((item) => item.id === value)
      composer.setInstruction(preset?.instruction || "")
      if (preset && controls.directionModes.includes("directed")) composer.setDeliveryModeRequest("directed")
    }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="custom">{composer.instruction && !selectedPreset ? "Custom direction" : "No preset"}</SelectItem>{composer.performancePresets.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>)}</SelectContent></Select></label>}
    {controls.naturalDirection
      ? <label className="performance-direction"><span>{controls.directionLabel}</span><Textarea rows={3} value={composer.instruction} disabled={composer.deliveryMode === "exact"} onChange={(event) => composer.setInstruction(event.target.value)} placeholder="Warm, intimate, slow at first, then more excited near the end…" />{composer.deliveryMode === "exact" && <small>Choose Add direction to control the overall performance.</small>}</label>
      : <p className="composer-engine-note">{composer.selectedCapability?.description || "This method uses the prepared script without a separate performance direction."}</p>}
    {(controls.rate || controls.pitch || controls.volume || controls.seed) && <div className="composer-fine-grid composer-performance-controls">
      {controls.rate && <label><span>Speed <b>{composer.rate.toFixed(2)}×</b></span><Slider aria-label="Recording speed" value={[composer.rate]} min={0.5} max={2} step={0.05} onValueChange={([value = 1]) => composer.setRate(value)} /></label>}
      {controls.pitch && <label><span>Pitch <b>{composer.pitch.toFixed(2)}×</b></span><Slider aria-label="Recording pitch" value={[composer.pitch]} min={0.5} max={2} step={0.05} onValueChange={([value = 1]) => composer.setPitch(value)} /></label>}
      {controls.volume && <label><span>Volume <b>{composer.volume}</b></span><Slider aria-label="Recording volume" value={[composer.volume]} min={0} max={100} step={1} onValueChange={([value = 50]) => composer.setVolume(value)} /></label>}
      {controls.seed && <label><span>Seed <b>repeatable</b></span><Input aria-label="Generation seed" type="number" min={0} max={65535} step={1} value={composer.seed} onChange={(event) => composer.setSeed(Math.max(0, Math.min(65535, Number(event.target.value) || 0)))} /></label>}
    </div>}
  </section>
}
