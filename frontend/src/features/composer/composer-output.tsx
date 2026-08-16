import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useComposer } from "./composer-controller"

export function ComposerOutput() {
  const composer = useComposer()
  const controls = composer.capabilityControls
  return <section className="composer-section">
    <header><div><span className="eyebrow">Output</span><h3>File settings</h3></div></header>
    {!composer.currentRoute ? <p className="composer-engine-note">Choose an exact route before configuring its output.</p> : controls.outputNote && <p className="composer-engine-note">{controls.outputNote}</p>}
    {!composer.outputFormatSupported && <div className="composer-warning"><b>{composer.format.toUpperCase()} came from the imported Draft.</b><span>It stays unchanged, but this Studio cannot generate that file type. Choose a supported type first.</span></div>}
    {composer.currentRoute && <div className="composer-output-route"><span>Exact provider model</span><SpeechModelIdentity provider={composer.currentRoute.provider} engine={composer.currentRoute.engine} tier={composer.currentRoute.model} modelId={composer.currentRoute.modelId} config={composer.config} /></div>}
    <div className="composer-fine-grid">
      <label><span>File type</span><Select value={composer.format} onValueChange={(value) => composer.setFormat(value as typeof composer.format)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{composer.formatOptions.map((item) => <SelectItem key={item} value={item}>{item}{item === composer.format && !composer.outputFormatSupported ? " · imported" : ""}</SelectItem>)}</SelectContent></Select></label>
    </div>
  </section>
}
