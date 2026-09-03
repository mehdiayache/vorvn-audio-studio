import { VoicePicker } from "@/components/voice-picker"
import { CreatorLanguagePicker } from "./creator-language-picker"
import { CreatorMethodPicker } from "./creator-method-picker"
import { CreatorModelPicker } from "./creator-model-picker"
import { CreatorCapabilityField, CreatorCapabilityGrid, CreatorCapabilityRoute } from "./panel/creator-capability-panel"
import { useSpeechCreator } from "./speech/speech-creator-controller"

export function CreatorWho() {
  const creator = useSpeechCreator()
  return <section className="creator-recording-bar" aria-label="Voice and recording context">
    <CreatorCapabilityRoute className="speech-creator-route">
      <CreatorCapabilityField label="Model" className="creator-model-field">
        <CreatorModelPicker routes={creator.visibleRoutes} selectedModelKey={creator.selectedModelKey} selectedCapabilityId={creator.route?.capabilityId || null} config={creator.config} onSelect={creator.selectModel} />
      </CreatorCapabilityField>
      <CreatorCapabilityGrid className="speech-context-grid">
        <CreatorCapabilityField label="Who is speaking?" className="creator-voice-field">
          <VoicePicker identities={creator.identities} value={creator.identityId} directory={creator.directory} playingKey={creator.playingKey} playerPlaying={creator.playerPlaying} onPlay={creator.onPlay} onChange={creator.selectIdentity} />
        </CreatorCapabilityField>
        <CreatorCapabilityField label="Output language">
          <CreatorLanguagePicker value={creator.language} options={creator.languageOptions} route={creator.currentRoute || undefined} customVoice={creator.selectedIdentity?.source === "owned"} onChange={creator.setLanguage} />
        </CreatorCapabilityField>
        <CreatorCapabilityField label="Recording mode" className="creator-method-field">
          <CreatorMethodPicker route={creator.currentRoute || undefined} selectedCapabilityId={creator.route?.capabilityId || null} onSelect={creator.applyRoute} />
        </CreatorCapabilityField>
      </CreatorCapabilityGrid>
    </CreatorCapabilityRoute>
  </section>
}
