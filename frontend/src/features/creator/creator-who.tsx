import { VoicePicker } from "@/components/voice-picker"
import { routeSelectionId } from "@/lib/creator-contract"
import { CreatorLanguagePicker } from "./creator-language-picker"
import { CreatorMethodPicker } from "./creator-method-picker"
import { useCreator } from "./creator-controller"

export function CreatorWho() {
  const creator = useCreator()
  return <section className="creator-recording-bar" aria-label="Voice and recording context">
    <div className="creator-context-field creator-voice-field">
      <span className="creator-field-label">Who is speaking?</span>
      <VoicePicker identities={creator.identities} value={creator.identityId} directory={creator.directory} playingKey={creator.playingKey} playerPlaying={creator.playerPlaying} onPlay={creator.onPlay} onChange={creator.selectIdentity} />
    </div>
    <div className="creator-context-field">
      <span className="creator-field-label">Output language</span>
      <CreatorLanguagePicker value={creator.language} options={creator.languageOptions} route={creator.currentRoute || undefined} customVoice={creator.selectedIdentity?.source === "owned"} onChange={creator.setLanguage} />
    </div>
    <div className="creator-context-field creator-method-field">
      <span className="creator-field-label">Model & recording method</span>
      <CreatorMethodPicker routes={creator.visibleRoutes} availableRoutes={creator.compatibleRoutes} selectedRouteId={routeSelectionId(creator.route)} selectedCapabilityId={creator.route?.capabilityId || null} language={creator.language} customVoice={creator.selectedIdentity?.source === "owned"} config={creator.config} onSelect={creator.applyRoute} />
    </div>
  </section>
}
