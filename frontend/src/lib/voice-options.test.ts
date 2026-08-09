import { describe, expect, it } from "vitest"

import type { VoiceBinding, VoiceRegistry } from "@/types/domain"
import { getVoiceOptions, languageForVoice } from "./voice-options"

function binding(id: string, engine: "audio" | "omni", tier: "plus" | "flash", source: "system" | "custom"): VoiceBinding {
  return { identity_id: `${source}:${id}`, provider_voice_id: id, name: id, description: "", languages: ["English"], source, provider: "alibaba", engine, tier, model_id: `${engine}-${tier}`, status: "active" }
}

const bindings = [binding("Tina", "omni", "plus", "system"), binding("Tina", "omni", "flash", "system"), binding("Mehdi", "omni", "plus", "custom"), binding("Lingxin", "audio", "plus", "system"), binding("Sarah", "audio", "flash", "custom")]
const registry: VoiceRegistry = {
  bindings,
  models: ["audio", "omni"].flatMap((engine) => ["plus", "flash"].map((tier) => { const found = bindings.filter((item) => item.engine === engine && item.tier === tier); return { engine: engine as "audio" | "omni", tier: tier as "plus" | "flash", model_id: `${engine}-${tier}`, label: engine, system_count: found.filter((item) => item.source === "system").length, custom_count: found.filter((item) => item.source === "custom").length, total_count: found.length, clone_supported: tier === "flash" || engine === "omni" } })),
  presets: [], source: { provider: "Alibaba", verified_at: "2026-08-07", audio_url: "", omni_url: "" },
}

describe("getVoiceOptions", () => {
  it("derives exact compatibility and counts from provider bindings", () => {
    const omni = getVoiceOptions(registry, "omni", "plus")
    expect(omni.compatible.map((voice) => voice.id)).toEqual(["Tina", "Mehdi"])
    expect(omni.summary).toMatchObject({ system_count: 1, custom_count: 1, total_count: 2 })
    expect(getVoiceOptions(registry, "audio", "plus").compatible.map((voice) => voice.id)).toEqual(["Lingxin"])
    expect(getVoiceOptions(registry, "audio", "flash").compatible.map((voice) => voice.id)).toEqual(["Sarah"])
  })

  it("keeps other model bindings discoverable without marking them compatible", () => {
    const omniFlash = getVoiceOptions(registry, "omni", "flash")
    expect(omniFlash.choices.some((voice) => voice.id === "Sarah")).toBe(true)
    expect(omniFlash.compatible.map((voice) => voice.id)).toEqual(["Tina"])
    expect(omniFlash.choices.find((voice) => voice.id === "Mehdi")?.compatible).toBe(false)
  })
})

describe("languageForVoice", () => {
  it("uses a cloned voice master language as an editable initial preference", () => {
    const voice = { ...getVoiceOptions(registry, "omni", "plus").compatible.find((item) => item.id === "Mehdi")!, languages: ["English", "Arabic"] }
    const custom = { ...bindings.find((item) => item.provider_voice_id === "Mehdi")!, reference: { source_language: "ar" } }
    expect(languageForVoice(voice, custom, { ar: "Arabic" })).toBe("Arabic")
    expect(languageForVoice(voice, custom, { ar: "Arabic" }, "English")).toBe("English")
  })

  it("does not infer a cloned-language preference for provider voices", () => {
    const voice = getVoiceOptions(registry, "omni", "plus").compatible.find((item) => item.id === "Tina")!
    const system = { ...bindings.find((item) => item.provider_voice_id === "Tina")!, reference: { source_language: "ar" } }
    expect(languageForVoice(voice, system, { ar: "Arabic" })).toBe("English")
  })
})
