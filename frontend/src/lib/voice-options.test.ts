import { describe, expect, it } from "vitest"

import type { VoiceBinding, VoiceRegistry } from "@/types/domain"
import { getVoiceIdentities, getVoiceOptions, routesForIdentity } from "./voice-options"

function binding(id: string, engine: "audio" | "omni", tier: "plus" | "flash", source: "system" | "custom"): VoiceBinding {
  return { identity_id: `${source}:${id}`, provider_voice_id: id, name: id, description: "", languages: ["English"], source, provider: "alibaba", region: "intl", adapter_key: engine, engine, tier, model_id: `${engine}-${tier}`, status: "active", estimate_rate_per_million_chars: 0, capabilities: [{ id: `${engine}_mode`, name: `${engine} mode`, description: "Provider capability" }] }
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

describe("voice-first routing", () => {
  it("groups provider bindings into one human identity", () => {
    const identities = getVoiceIdentities(registry)
    const tina = identities.find((item) => item.name === "Tina")!
    expect(tina.routes).toHaveLength(2)
    expect(identities.filter((item) => item.name === "Tina")).toHaveLength(1)
  })

  it("preserves complete route capability data for the Composer", () => {
    const tina = getVoiceIdentities(registry).find((item) => item.name === "Tina")!
    expect(tina.routes[0]).toMatchObject({
      provider: "alibaba", region: "intl", adapterKey: "omni",
      capabilities: [{ id: "omni_mode", name: "omni mode", description: "Provider capability" }],
    })
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
    expect(routesForIdentity(lingxin, "English")).toHaveLength(1)
    expect(routesForIdentity(lingxin, "Arabic")).toHaveLength(1)
  })

  it("chooses the preferred route without changing identity", () => {
    const tina = getVoiceIdentities(registry).find((item) => item.name === "Tina")!
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
