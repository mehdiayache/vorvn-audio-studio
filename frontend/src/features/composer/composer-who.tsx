import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { VoiceLanguageSupport } from "@/components/voice-language-support"
import { VoiceMethodPicker } from "@/components/production-tools/voice-method-picker"
import { VoicePicker } from "@/components/voice-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { routeSelectionId } from "@/lib/composer-contract"
import { useComposer } from "./composer-controller"

export function ComposerWho() {
  const composer = useComposer()
  return <section className="composer-section voice-capability-section">
    <header><div><span className="eyebrow">Voice & method</span><h3>Set the recording source</h3></div></header>
    <div className="composer-route-grid voice-first-grid">
      <label className="wide">
        <span>Voice</span>
        <VoicePicker identities={composer.identities} value={composer.identityId} directory={composer.directory} playingKey={composer.playingKey} playerPlaying={composer.playerPlaying} onPlay={composer.onPlay} onChange={composer.selectIdentity} />
        {composer.selectedIdentity?.editorialLanguage && <small className="voice-source-note">The flag is editorial context, not a language limit.</small>}
      </label>
      <label className="wide">
        <span>Output language</span>
        <Select value={composer.language} onValueChange={composer.setLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{composer.languageOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
        <small>The voice stays fixed when output language changes.</small>
      </label>
    </div>
    <div className="method-heading"><b>Recording method</b><span>Choose the exact provider route.</span></div>
    {composer.visibleRoutes.length
      ? <VoiceMethodPicker routes={composer.visibleRoutes} availableRoutes={composer.compatibleRoutes} selectedRouteId={routeSelectionId(composer.route)} selectedCapabilityId={composer.route?.capabilityId || null} language={composer.language} customVoice={composer.selectedIdentity?.source === "owned"} config={composer.config} onSelect={composer.applyRoute} />
      : <div className="capability-empty"><b>{composer.selectedIdentity ? "This voice has no ready recording method." : "Choose a voice to see its exact routes."}</b><span>{composer.selectedIdentity ? "Open Voices to create a provider binding." : "Nothing is preselected. You stay in control of the exact route."}</span></div>}
    {composer.currentRoute && <div className="composer-registry-note">
      <b>Selected route</b>
      <span>{composer.selectedIdentity?.name} · {composer.language}</span>
      <SpeechModelIdentity engine={composer.currentRoute.engine} tier={composer.currentRoute.model} modelId={composer.currentRoute.modelId} config={composer.config} />
      <VoiceLanguageSupport compact route={composer.currentRoute} language={composer.language} customVoice={composer.selectedIdentity?.source === "owned"} />
    </div>}
  </section>
}
