import { VoicePicker } from "@/components/voice-picker"
import { routeSelectionId } from "@/lib/creator-contract"
import { CreatorLanguagePicker } from "./creator-language-picker"
import { CreatorMethodPicker } from "./creator-method-picker"
import { CreatorModelPicker } from "./creator-model-picker"
import { useCreator } from "./creator-controller"

export function CreatorWho() {
  const creator = useCreator()
  return <section className="creator-recording-bar" aria-label="Voice and recording context">
    <div className="creator-context-field creator-model-field">
      <span className="creator-field-label">Model</span>
      <CreatorModelPicker routes={creator.visibleRoutes} selectedRouteId={routeSelectionId(creator.route)} selectedCapabilityId={creator.route?.capabilityId || null} config={creator.config} onSelect={creator.applyRoute} />
    </div>
    <div className="creator-context-field creator-voice-field">
      <span className="creator-field-label">Who is speaking?</span>
      <VoicePicker identities={creator.identities} value={creator.identityId} directory={creator.directory} playingKey={creator.playingKey} playerPlaying={creator.playerPlaying} onPlay={creator.onPlay} onChange={creator.selectIdentity} />
    </div>
    <div className="creator-context-field">
      <span className="creator-field-label">Output language</span>
      <CreatorLanguagePicker value={creator.language} options={creator.languageOptions} route={creator.currentRoute || undefined} customVoice={creator.selectedIdentity?.source === "owned"} onChange={creator.setLanguage} />
    </div>
    <div className="creator-context-field creator-method-field">
      <span className="creator-field-label">Recording mode</span>
      <CreatorMethodPicker route={creator.currentRoute || undefined} selectedCapabilityId={creator.route?.capabilityId || null} onSelect={creator.applyRoute} />
    </div>
  </section>
}
