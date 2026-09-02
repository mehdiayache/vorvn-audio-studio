import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { DEFAULT_RECORDING_VOLUME } from "@/lib/creator-contract"
import { useCreator } from "./creator-controller"

function modeLabel(mode: string) {
  if (mode === "exact") return "Keep the script"
  if (mode === "directed") return "Add direction"
  return mode.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase())
}

export function CreatorPerformance() {
  const creator = useCreator()
  const controls = creator.capabilityControls
  const selectedPreset = creator.performancePresets.find((preset) => preset.instruction === creator.instruction)
  return <section className="creator-section">
    <header><div><span className="eyebrow">Sound</span><h3>Shape the delivery</h3></div></header>
    {controls.directionModes.length > 1 && <div className="delivery-mode"><div><span>Delivery</span>{controls.directionModes.map((mode) => <Button key={mode} variant={creator.deliveryMode === mode ? "secondary" : "outline"} onClick={() => creator.setDeliveryModeRequest(mode)}>{modeLabel(mode)}</Button>)}</div><p>{creator.deliveryMode === "exact" ? controls.exactHelp : controls.directedHelp}</p></div>}
    {creator.performancePresets.length > 0 && <label className="performance-preset-select"><span>Performance preset</span><Select value={selectedPreset?.id || "custom"} onValueChange={(value) => {
      const preset = creator.performancePresets.find((item) => item.id === value)
      creator.setInstruction(preset?.instruction || "")
      if (preset && controls.directionModes.includes("directed")) creator.setDeliveryModeRequest("directed")
    }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="custom">{creator.instruction && !selectedPreset ? "Custom direction" : "No preset"}</SelectItem>{creator.performancePresets.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>)}</SelectContent></Select></label>}
    {controls.naturalDirection
      ? <label className="performance-direction"><span>{controls.directionLabel}</span><Textarea rows={3} value={creator.instruction} disabled={creator.deliveryMode === "exact"} onChange={(event) => creator.setInstruction(event.target.value)} placeholder="Warm, intimate, slow at first, then more excited near the end…" />{creator.deliveryMode === "exact" && <small>Choose Add direction to control the overall performance.</small>}</label>
      : <p className="creator-engine-note">{creator.selectedCapability?.description || "This method uses the prepared script without a separate performance direction."}</p>}
    {(controls.rate || controls.pitch || controls.volume || controls.seed) && <div className="creator-fine-grid creator-performance-controls">
      {controls.rate && <label><span>Speed <b>{creator.rate.toFixed(2)}×</b></span><Slider aria-label="Recording speed" value={[creator.rate]} min={0.5} max={2} step={0.05} onValueChange={([value = 1]) => creator.setRate(value)} /></label>}
      {controls.pitch && <label><span>Pitch <b>{creator.pitch.toFixed(2)}×</b></span><Slider aria-label="Recording pitch" value={[creator.pitch]} min={0.5} max={2} step={0.05} onValueChange={([value = 1]) => creator.setPitch(value)} /></label>}
      {controls.volume && <label><span>Volume <b>{creator.volume}%</b></span><Slider aria-label="Recording volume" value={[creator.volume]} min={0} max={100} step={1} onValueChange={([value = DEFAULT_RECORDING_VOLUME]) => creator.setVolume(value)} /></label>}
      {controls.seed && <label><span>Seed <b>repeatable</b></span><Input aria-label="Generation seed" type="number" min={0} max={65535} step={1} value={creator.seed} onChange={(event) => creator.setSeed(Math.max(0, Math.min(65535, Number(event.target.value) || 0)))} /></label>}
    </div>}
  </section>
}
