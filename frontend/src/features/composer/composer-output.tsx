import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { useComposer } from "./composer-controller"

export function ComposerOutput() {
  const composer = useComposer()
  const controls = composer.capabilityControls
  return <section className="composer-section">
    <header><div><span className="eyebrow">Output</span><h3>{controls.rate || controls.pitch || controls.volume ? "File and voice tuning" : "File settings"}</h3></div></header>
    {!composer.currentRoute ? <p className="composer-engine-note">Choose an exact route before configuring its output.</p> : controls.outputNote && <p className="composer-engine-note">{controls.outputNote}</p>}
    <div className="composer-fine-grid">
      {controls.rate && <label><span>Speed <b>{composer.rate.toFixed(2)}×</b></span><Slider value={[composer.rate]} min={0.5} max={2} step={0.05} onValueChange={([value = 1]) => composer.setRate(value)} /></label>}
      {controls.pitch && <label><span>Pitch <b>{composer.pitch.toFixed(2)}×</b></span><Slider value={[composer.pitch]} min={0.5} max={2} step={0.05} onValueChange={([value = 1]) => composer.setPitch(value)} /></label>}
      {controls.volume && <label><span>Volume <b>{composer.volume}</b></span><Slider value={[composer.volume]} min={0} max={100} step={1} onValueChange={([value = 50]) => composer.setVolume(value)} /></label>}
      <label><span>File type</span><Select value={composer.format} onValueChange={(value) => composer.setFormat(value as typeof composer.format)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(composer.config?.formats || ["mp3"]).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></label>
    </div>
  </section>
}
