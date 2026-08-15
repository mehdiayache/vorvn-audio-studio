import { VoicePicker } from "@/components/voice-picker"
import { routeSelectionId } from "@/lib/composer-contract"
import { ComposerLanguagePicker } from "./composer-language-picker"
import { ComposerMethodPicker } from "./composer-method-picker"
import { useComposer } from "./composer-controller"

export function ComposerWho() {
  const composer = useComposer()
  return <section className="composer-recording-bar" aria-label="Voice and recording context">
    <div className="composer-context-field composer-voice-field">
      <span className="composer-field-label">Who is speaking?</span>
      <VoicePicker identities={composer.identities} value={composer.identityId} directory={composer.directory} playingKey={composer.playingKey} playerPlaying={composer.playerPlaying} onPlay={composer.onPlay} onChange={composer.selectIdentity} />
    </div>
    <div className="composer-context-field">
      <span className="composer-field-label">Output language</span>
      <ComposerLanguagePicker value={composer.language} options={composer.languageOptions} route={composer.currentRoute || undefined} customVoice={composer.selectedIdentity?.source === "owned"} onChange={composer.setLanguage} />
    </div>
    <div className="composer-context-field composer-method-field">
      <span className="composer-field-label">Recording method</span>
      <ComposerMethodPicker routes={composer.visibleRoutes} availableRoutes={composer.compatibleRoutes} selectedRouteId={routeSelectionId(composer.route)} selectedCapabilityId={composer.route?.capabilityId || null} language={composer.language} customVoice={composer.selectedIdentity?.source === "owned"} config={composer.config} onSelect={composer.applyRoute} />
    </div>
  </section>
}
