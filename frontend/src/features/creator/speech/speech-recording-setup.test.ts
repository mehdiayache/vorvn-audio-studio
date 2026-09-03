import { describe, expect, it } from "vitest"

import { resolveSpeechRecordingSetup, type SpeechRecordingSetupValue } from "./speech-recording-setup"
import type { VoiceDirectory } from "@/types/domain"

const directory = {
  config: null, cloned: [], meta: {}, catalog: [], identities: [],
  registry: {
    bindings: [{
      binding_id: "binding-one", identity_id: "identity-one", provider_voice_id: "provider-one",
      name: "Voice One", description: "", languages: ["English"], source: "custom",
      provider: "alibaba", region: "intl", adapter_key: "audio", engine: "audio",
      tier: "flash", model_id: "qwen-audio-3.0-tts-flash", status: "ready",
      capabilities: [{ id: "expressive_tags", name: "Expressive", description: "", controls: {}, ui_metadata: {} }],
    }],
    models: [], presets: [], source: { provider: "Alibaba", verified_at: "", audio_url: "" },
  },
} as unknown as VoiceDirectory

describe("SpeechRecordingSetup exact-route state", () => {
  it("does not choose the first identity or route", () => {
    const value: SpeechRecordingSetupValue = { identityId: "", route: null, language: "Auto" }
    const resolved = resolveSpeechRecordingSetup(directory, value)
    expect(resolved.identities).toHaveLength(1)
    expect(resolved.identity).toBeUndefined()
    expect(resolved.route).toBeNull()
  })

  it("keeps an explicit route when output language changes", () => {
    const base: SpeechRecordingSetupValue = {
      identityId: "identity-one",
      route: { kind: "owned", bindingId: "binding-one", capabilityId: null },
      language: "Arabic",
    }
    expect(resolveSpeechRecordingSetup(directory, base).route?.bindingId).toBe("binding-one")
    expect(resolveSpeechRecordingSetup(directory, { ...base, language: "English" }).route?.bindingId).toBe("binding-one")
  })
})
