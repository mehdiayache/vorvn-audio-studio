import { describe, expect, it } from "vitest"

import type { ProductionPart } from "@/types/domain"
import type { VoiceChoice } from "@/lib/voice-options"
import {
  buildSpeechCommand,
  compositionContext,
  editorialBaseline,
  resolveSelectedRoute,
  routeSelection,
  routeSelectionFromPersistedDraft,
  toGeneratePayload,
  type CompositionDraft,
} from "./composer-contract"

const ownedRoute: VoiceChoice = {
  id: "binding-1",
  bindingId: "binding-1",
  providerVoiceId: "provider-voice-1",
  identityId: "identity-1",
  name: "Sarah",
  description: "",
  source: "mine",
  engine: "audio",
  model: "flash",
  modelId: "qwen-audio-3.0-tts-flash",
  provider: "alibaba",
  region: "intl",
  adapterKey: "qwen_audio",
  capabilities: [{ id: "expressive_tags", name: "Expressive + tags", description: "" }],
  compatible: true,
  languages: ["English"],
  status: "ready",
}

function draft(route: CompositionDraft["route"]): CompositionDraft {
  return {
    voiceIdentityId: "identity-1",
    castRoleId: null,
    route,
    text: { raw: "Hello", shaped: "", tagged: "", active: "raw" },
    delivery: { modeId: "exact", instruction: "", rate: 1, pitch: 1, volume: 50, seed: 0 },
    output: { format: "mp3", language: "English" },
    editorialPatch: {},
  }
}

describe("provider-neutral Composer contract", () => {
  it("uses the same draft and command contract for Standalone and Production", () => {
    const selected = routeSelection(ownedRoute)
    const standalone = buildSpeechCommand({ context: compositionContext({ sessionId: "session-1" }), draft: draft(selected) })
    const production = buildSpeechCommand({ context: compositionContext({ productionId: 7, insertAt: 2, insertBeforePartId: "part-public-3" }), draft: draft(selected) })
    expect(standalone.route).toEqual(production.route)
    expect(standalone.text).toEqual(production.text)
    expect(standalone.context).toEqual({ kind: "standalone", sessionId: "session-1" })
    expect(production.context).toEqual({ kind: "production", productionId: 7, operation: "new_part", insertion: { kind: "before_part", partId: "part-public-3" } })
    expect(toGeneratePayload(production, ownedRoute)).toMatchObject({
      insert_at: null,
      insert_before_part_id: "part-public-3",
    })
  })

  it("refuses generation without an operator-selected exact route", () => {
    expect(() => buildSpeechCommand({ context: compositionContext({}), draft: draft(null) }))
      .toThrow("Choose an exact recording route")
  })

  it("keeps engine, model and provider voice out of command truth", () => {
    const command = buildSpeechCommand({ context: compositionContext({}), draft: draft(routeSelection(ownedRoute)) })
    expect(command).not.toHaveProperty("engine")
    expect(command).not.toHaveProperty("model")
    expect(command).not.toHaveProperty("voice")
    expect(command.route).toEqual({ kind: "owned", bindingId: "binding-1", capabilityId: null })
  })

  it("represents an arbitrary future delivery mode without changing the canonical contract", () => {
    const future = draft(routeSelection(ownedRoute))
    future.delivery.modeId = "character_whisper_v2"
    const command = buildSpeechCommand({ context: compositionContext({}), draft: future })
    expect(command.delivery.modeId).toBe("character_whisper_v2")
  })

  it("derives compatibility labels only in the temporary HTTP adapter", () => {
    const command = buildSpeechCommand({ context: compositionContext({}), draft: draft(routeSelection(ownedRoute)) })
    expect(toGeneratePayload(command, ownedRoute)).toMatchObject({
      binding_id: "binding-1",
      catalogue_voice_id: null,
      voice: "provider-voice-1",
      engine: "audio",
      model: "flash",
    })
  })

  it("represents multiple modes on one exact binding and requires an explicit one", () => {
    const multi = { ...ownedRoute, capabilities: [
      { id: "narration", name: "Narration", description: "" },
      { id: "character", name: "Character", description: "" },
    ] }
    expect(resolveSelectedRoute(routeSelection(multi), [multi])).toBeNull()
    const selected = routeSelection(multi, "character")
    expect(resolveSelectedRoute(selected, [multi])).toBe(multi)
    expect(buildSpeechCommand({ context: compositionContext({}), draft: draft(selected) }).route)
      .toMatchObject({ capabilityId: "character" })
  })

  it("keeps existing Part truth as a read-only editorial baseline", () => {
    const part = { id: 9, revision: 4, text: "Current script", cast_role_id: "role-1", selected_take_id: 12 } as ProductionPart
    expect(editorialBaseline(part)).toEqual({ partId: 9, revision: 4, script: "Current script", castRoleId: "role-1", selectedTakeId: 12 })
  })

  it("restores exact routes only from an explicitly saved Draft, never a recorded Part", () => {
    const routeFields = { binding_id: "binding-1", capability_id: "expressive_tags" }
    expect(routeSelectionFromPersistedDraft({ kind: "speech", ...routeFields } as ProductionPart)).toBeNull()
    expect(routeSelectionFromPersistedDraft({ kind: "draft", ...routeFields } as ProductionPart))
      .toEqual({ kind: "owned", bindingId: "binding-1", capabilityId: "expressive_tags" })
  })
})
