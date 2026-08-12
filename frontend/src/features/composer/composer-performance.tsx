import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useComposer } from "./composer-controller"

export function ComposerPerformance() {
  const composer = useComposer()
  const controls = composer.capabilityControls
  return <section className="composer-section">
    <header><div><span className="eyebrow">Performance</span><h3>How should it sound?</h3></div></header>
    {controls.directionModes.length > 1 && <div className="delivery-mode"><div><span>Delivery</span>{controls.directionModes.includes("exact") && <Button variant={composer.deliveryMode === "exact" ? "secondary" : "outline"} onClick={() => composer.setDeliveryModeRequest("exact")}>Keep the script</Button>}{controls.directionModes.includes("directed") && <Button variant={composer.deliveryMode === "directed" ? "secondary" : "outline"} onClick={() => composer.setDeliveryModeRequest("directed")}>Add direction</Button>}</div><p>{composer.deliveryMode === "exact" ? controls.exactHelp : controls.directedHelp}</p></div>}
    {controls.naturalDirection
      ? <label><span>{controls.directionLabel}</span><Input value={composer.instruction} disabled={composer.deliveryMode === "exact"} maxLength={composer.config?.instruction_max || 100} onChange={(event) => composer.setInstruction(event.target.value)} placeholder="Describe the performance in natural language" />{composer.deliveryMode === "exact" && <small>Choose Add direction to control the overall performance.</small>}</label>
      : <p className="composer-engine-note">{composer.selectedCapability?.description || "This method uses the prepared script without a separate performance direction."}</p>}
    {composer.performancePresets.length > 0 && <div className="performance-presets"><span>Presets</span><div>{composer.performancePresets.map((preset) => <Button key={preset.id} type="button" variant={composer.instruction === preset.instruction ? "secondary" : "outline"} onClick={() => { composer.setInstruction(preset.instruction); if (controls.directionModes.includes("directed")) composer.setDeliveryModeRequest("directed") }}><b>{preset.name}</b><small>{preset.instruction}</small></Button>)}</div></div>}
  </section>
}
