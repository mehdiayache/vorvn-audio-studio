import { describe, expect, it } from "vitest"

import { resolveVoice, voiceKey } from "@/lib/voice"
import type { VoiceDirectory } from "@/types/domain"

const directory: VoiceDirectory = {
  config: {
    voices: { plus: { longanlingxin: "female, warm and empathetic" }, flash: { "loongeva_v3.6": "female, 28, native English" } },
    default_voice: { plus: "longanlingxin", flash: "loongeva_v3.6" },
    formats: ["mp3"],
    languages: ["Auto"],
    has_key: true,
    capabilities: { audio: { label: "Qwen Audio", purpose: "Speech", models: { plus: "qwen-audio-plus", flash: "qwen-audio-flash" }, system_languages: ["English"], estimate_rates_per_million_chars: { plus: 0, flash: 0 } } },
  },
  cloned: [],
  meta: {
    "mehdi1-06ca5c1ad8d44b1daa5510448cd0e6da": { image: "/icon/mehdi.png" },
  },
  catalog: [],
}

describe("voice identity", () => {
  it("removes the provider model prefix from storage ids", () => {
    expect(voiceKey("qwen-audio-3.0-tts-flash-mehdi1-06ca5c1ad8d44b1daa5510448cd0e6da")).toBe("mehdi1-06ca5c1ad8d44b1daa5510448cd0e6da")
  })

  it("turns a cloned provider id into a human label", () => {
    const voice = resolveVoice("qwen-audio-3.0-tts-flash-mehdi1-06ca5c1ad8d44b1daa5510448cd0e6da", directory)
    expect(voice.name).toBe("Mehdi 1 · your voice")
    expect(voice.image).toBe("/icon/mehdi.png")
  })

  it("uses friendly stock names and descriptions", () => {
    expect(resolveVoice("loongeva_v3.6", directory)).toMatchObject({ name: "Eva", detail: "female, 28, native English" })
    expect(resolveVoice("longanlingxin", directory)).toMatchObject({ name: "Lingxin", detail: "female, warm and empathetic" })
  })

  it("resolves registry truth from a stable catalogue route id", () => {
    const withRegistry = {
      ...directory,
      registry: { bindings: [{ catalogue_voice_id: "provider:region:model:aiden", provider_voice_id: "aiden", name: "Aiden", description: "Friendly young voice", image: null, gender: "male" }] },
    } as unknown as VoiceDirectory
    expect(resolveVoice("provider:region:model:aiden", withRegistry)).toMatchObject({
      name: "Aiden", detail: "Friendly young voice", gender: "male", unavailable: false,
    })
  })

  it("uses the stable identity for historical provider ids", () => {
    const withIdentity: VoiceDirectory = { ...directory, identities: [{
      id: "voice_serenity", name: "Eve Serenity", metadata: { recording_language: "en", editorial_language: "en", trait: "gentle", image: "/icon/eve.png" },
      references: [], bindings: [], jobs: [], available_routes: [],
      usage: { uses: 0, productions: 0, spend: 0, last_used: null, preview_filename: "" },
      created_at: "2026-08-01", updated_at: "2026-08-01",
    }] }
    expect(resolveVoice("qwen-audio-3.0-tts-flash-serinity1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", withIdentity, "voice_serenity")).toMatchObject({
      key: "voice_serenity", name: "Eve Serenity", detail: "🇬🇧 English focus · gentle", image: "/icon/eve.png", unavailable: false, editorialLanguage: "en",
    })
  })
})
