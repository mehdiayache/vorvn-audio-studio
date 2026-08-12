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
    <header><div><span className="eyebrow">Who</span><h3>Choose who speaks and the exact recording method</h3></div></header>
    <div className="composer-route-grid voice-first-grid">
      {composer.productionId && composer.cast.length > 0 && <label className="wide">
        <span>Cast role</span>
        <Select value={composer.castRoleId || "none"} onValueChange={composer.selectCastRole}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Cast Role</SelectItem>
            {composer.cast.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}{role.persona_name ? ` · ${role.persona_name}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        <small>A role applies its assigned voice identity, never a provider route.</small>
      </label>}
      <label className="wide">
        <span>Voice</span>
        <VoicePicker identities={composer.identities} value={composer.identityId} directory={composer.directory} playingKey={composer.playingKey} playerPlaying={composer.playerPlaying} onPlay={composer.onPlay} onChange={composer.selectIdentity} />
        {composer.selectedIdentity?.editorialLanguage && <small className="voice-source-note">The flag is a team casting tag. It never limits this voice.</small>}
      </label>
    </div>
    <div className="method-heading"><b>Exact recording method</b><span>Choose one exact route. Audio Studio never picks, replaces or falls back for you.</span></div>
    {composer.selectedIdentity?.routes.length
      ? <VoiceMethodPicker routes={composer.selectedIdentity.routes} availableRoutes={composer.compatibleRoutes} selectedRouteId={routeSelectionId(composer.route)} selectedCapabilityId={composer.route?.capabilityId || null} language={composer.language} customVoice={composer.selectedIdentity.source === "owned"} config={composer.config} onSelect={composer.applyRoute} />
      : <div className="capability-empty"><b>{composer.selectedIdentity ? "This voice has no ready recording method." : "Choose a voice to see its exact routes."}</b><span>{composer.selectedIdentity ? "Open Voices to create a provider binding." : "Nothing is preselected. You stay in control of the exact route."}</span></div>}
    {composer.currentRoute && <div className="composer-registry-note">
      <b>Selected route</b>
      <span>{composer.selectedIdentity?.name} · {composer.language}</span>
      <SpeechModelIdentity engine={composer.currentRoute.engine} tier={composer.currentRoute.model} modelId={composer.currentRoute.modelId} config={composer.config} />
      <VoiceLanguageSupport compact route={composer.currentRoute} language={composer.language} customVoice={composer.selectedIdentity?.source === "owned"} />
    </div>}
  </section>
}
