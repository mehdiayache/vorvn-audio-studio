import { describe, expect, it } from "vitest"

import type { VoiceBinding, VoiceRegistry } from "@/types/domain"
import { getVoiceIdentities, routesForIdentity } from "./voice-options"

function binding(id: string, engine: string, tier: string, source: "system" | "custom", provider = "alibaba"): VoiceBinding {
  return { identity_id: `${source}:${id}`, provider_voice_id: id, name: id, description: "", gender: id === "Sarah" ? "female" : "", languages: ["English"], source, provider, region: "intl", adapter_key: engine, engine, tier, model_id: `${engine}-${tier}`, status: "active", estimate_rate_per_million_chars: 0, capabilities: [{ id: `${engine}_mode`, name: `${engine} mode`, description: "Provider capability" }] }
}

const bindings = [binding("Lingxin", "audio", "plus", "system"), binding("Lingxin", "audio", "flash", "system"), binding("Mehdi", "qwen_tts", "vc", "custom"), binding("Sarah", "audio", "flash", "custom")]
const registry: VoiceRegistry = {
  bindings,
  models: ["plus", "flash"].map((tier) => { const found = bindings.filter((item) => item.engine === "audio" && item.tier === tier); return { engine: "audio", tier, model_id: `audio-${tier}`, label: "audio", system_count: found.filter((item) => item.source === "system").length, custom_count: found.filter((item) => item.source === "custom").length, total_count: found.length, clone_supported: tier === "flash" } }),
  presets: [], source: { provider: "Alibaba", verified_at: "2026-08-07", audio_url: "" },
}

describe("voice-first routing", () => {
  it("groups provider bindings into one human identity", () => {
    const identities = getVoiceIdentities(registry)
    const lingxin = identities.find((item) => item.name === "Lingxin")!
    expect(lingxin.routes).toHaveLength(2)
    expect(identities.filter((item) => item.name === "Lingxin")).toHaveLength(1)
  })

  it("preserves complete route capability data for the Composer", () => {
    const mehdi = getVoiceIdentities(registry).find((item) => item.name === "Mehdi")!
    expect(mehdi.routes[0]).toMatchObject({
      provider: "alibaba", region: "intl", adapterKey: "qwen_tts",
      capabilities: [{ id: "qwen_tts_mode", name: "qwen_tts mode", description: "Provider capability" }],
    })
  })

  it("keeps provider identity and descriptive gender open to future providers", () => {
    const eleven = binding("Maya", "eleven_multilingual", "v3", "system", "elevenlabs")
    eleven.gender = "female"
    const identities = getVoiceIdentities({ ...registry, bindings: [...registry.bindings, eleven] })
    const maya = identities.find((item) => item.name === "Maya")!
    expect(maya.gender).toBe("female")
    expect(maya.routes[0]).toMatchObject({ provider: "elevenlabs", engine: "eleven_multilingual", model: "v3" })
  })

  it("keeps published language coverage out of identity casting", () => {
    const customRegistry = { ...registry, bindings: registry.bindings.map((item) => item.provider_voice_id === "Mehdi" ? { ...item, languages: ["English"], reference: { source_language: "ar" } } : item) }
    const mehdi = getVoiceIdentities(customRegistry).find((item) => item.name === "Mehdi")!
    expect(mehdi.editorialLanguage).toBe("")
    expect(routesForIdentity(mehdi, "English")).toHaveLength(1)
    expect(routesForIdentity(mehdi, "Arabic")).toHaveLength(1)
    expect(routesForIdentity(mehdi, "French")).toHaveLength(1)
  })

  it("keeps provider catalogue coverage informational too", () => {
    const lingxin = getVoiceIdentities(registry).find((item) => item.name === "Lingxin")!
    expect(routesForIdentity(lingxin, "English")).toHaveLength(2)
    expect(routesForIdentity(lingxin, "Arabic")).toHaveLength(2)
  })

  it("never casts a binding whose provider creation is not ready", () => {
    const creating = {
      ...registry,
      bindings: registry.bindings.map((item) => item.provider_voice_id === "Mehdi"
        ? { ...item, status: "creating" }
        : item),
    }
    expect(getVoiceIdentities(creating).some((item) => item.name === "Mehdi")).toBe(false)
  })

})
