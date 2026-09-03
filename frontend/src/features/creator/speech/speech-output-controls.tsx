import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSpeechCreator } from "./speech-creator-controller"

export function SpeechOutputControls() {
  const creator = useSpeechCreator()
  const controls = creator.capabilityControls
  return <section className="creator-section">
    <header><div><span className="eyebrow">Output</span><h3>File settings</h3></div></header>
    {!creator.currentRoute ? <p className="creator-engine-note">Choose an exact route before configuring its output.</p> : controls.outputNote && <p className="creator-engine-note">{controls.outputNote}</p>}
    {!creator.outputFormatSupported && <div className="creator-warning"><b>{creator.format.toUpperCase()} came from the imported Draft.</b><span>It stays unchanged, but this Studio cannot generate that file type. Choose a supported type first.</span></div>}
    {creator.currentRoute && <div className="creator-output-route"><span>Provider and model</span><b>{creator.currentRoute.provider.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</b><SpeechModelIdentity provider={creator.currentRoute.provider} engine={creator.currentRoute.engine} tier={creator.currentRoute.model} modelId={creator.currentRoute.modelId} config={creator.config} /></div>}
    <div className="creator-fine-grid">
      <label><span>File type</span><Select value={creator.format} onValueChange={(value) => creator.setFormat(value as typeof creator.format)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{creator.formatOptions.map((item) => <SelectItem key={item} value={item}>{item}{item === creator.format && !creator.outputFormatSupported ? " · imported" : ""}</SelectItem>)}</SelectContent></Select></label>
    </div>
  </section>
}
