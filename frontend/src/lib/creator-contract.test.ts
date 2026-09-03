import { describe, expect, it } from "vitest"

import type { ProjectPart } from "@/types/domain"
import type { VoiceChoice } from "@/lib/voice-options"
import {
  buildSpeechCommand,
  creatorTextFromPart,
  compositionContext,
  editorialBaseline,
  resolveSelectedRoute,
  replacementRouteSelectionFromPart,
  routeSelection,
  routeSelectionFromPart,
  toGeneratePayload,
  type CompositionDraft,
} from "./creator-contract"

const ownedRoute: VoiceChoice = {
  id: "binding-1",
  bindingId: "binding-1",
  providerVoiceId: "provider-voice-1",
  identityId: "identity-1",
  name: "Sarah",
  description: "",
  gender: "",
  source: "owned",
  engine: "audio",
  model: "flash",
  modelId: "qwen-audio-3.0-tts-flash",
  provider: "alibaba",
  region: "intl",
  adapterKey: "qwen_audio",
  capabilities: [{ id: "expressive_tags", name: "Expressive + tags", description: "", controls: {}, uiMetadata: {} }],
  compatible: true,
  languages: ["English"],
  status: "ready",
}

function draft(route: CompositionDraft["route"]): CompositionDraft {
  return {
    voiceIdentityId: "identity-1",
    route,
    text: { raw: "Hello", shaped: "", tagged: "", active: "raw" },
    textPreparation: { tagDensity: "normal", spokenProfile: "spoken_1", pendingReview: null },
    delivery: { modeId: "exact", instruction: "", rate: 1, pitch: 1, volume: 50, seed: 0, enableSsml: false },
    output: { format: "mp3", language: "English" },
    editorialPatch: {},
  }
}

describe("provider-neutral Creator contract", () => {
  it("uses the same draft and command contract for Standalone and Project", () => {
    const selected = routeSelection(ownedRoute)
    const standalone = buildSpeechCommand({ context: compositionContext({}), draft: draft(selected) })
    const project = buildSpeechCommand({ context: compositionContext({ projectId: 7, insertBeforePartId: "part-public-3" }), draft: draft(selected) })
    expect(standalone.route).toEqual(project.route)
    expect(standalone.text).toEqual(project.text)
    expect(standalone.context).toEqual({ kind: "standalone" })
    expect(project.context).toEqual({ kind: "project", projectId: 7, insertion: { kind: "before_part", partId: "part-public-3" } })
    expect(toGeneratePayload(project, { workspace_id: 4, project_id: 7, project_type: "audiovisual", selection: { target: "script_part" } })).toMatchObject({
      context: { workspace_id: 4, project_id: 7, project_type: "audiovisual", selection: { target: "script_part" } },
      insert_before_part_id: "part-public-3",
    })
    expect(toGeneratePayload(project, { workspace_id: 4 })).not.toHaveProperty("operation")
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

  it("sends only the exact route and never provider-derived compatibility fields", () => {
    const command = buildSpeechCommand({ context: compositionContext({}), draft: draft(routeSelection(ownedRoute)) })
    const payload = toGeneratePayload(command, { workspace_id: 4, folder_id: 27 })
    expect(payload).toMatchObject({
      context: { workspace_id: 4, folder_id: 27 },
      binding_id: "binding-1",
      catalogue_voice_id: null,
      spoken_profile: "spoken_1",
    })
    expect(payload).not.toHaveProperty("voice")
    expect(payload).not.toHaveProperty("engine")
    expect(payload).not.toHaveProperty("model")
  })

  it("represents multiple modes on one exact binding and requires an explicit one", () => {
    const multi = { ...ownedRoute, capabilities: [
      { id: "narration", name: "Narration", description: "", controls: {}, uiMetadata: {} },
      { id: "character", name: "Character", description: "", controls: {}, uiMetadata: {} },
    ] }
    expect(resolveSelectedRoute(routeSelection(multi), [multi])).toBeNull()
    const selected = routeSelection(multi, "character")
    expect(resolveSelectedRoute(selected, [multi])).toBe(multi)
    expect(buildSpeechCommand({ context: compositionContext({}), draft: draft(selected) }).route)
      .toMatchObject({ capabilityId: "character" })
  })

  it("keeps existing Part truth as a read-only editorial baseline", () => {
    const part = { id: 9, revision: 4, text: "Current script", clip_id: 12 } as ProjectPart
    expect(editorialBaseline(part)).toEqual({ partId: 9, revision: 4, script: "Current script" })
  })

  it("restores the exact saved route for Drafts and active recordings", () => {
    const routeFields = { binding_id: "binding-1", capability_id: "expressive_tags" }
    expect(routeSelectionFromPart({ kind: "speech", ...routeFields } as ProjectPart))
      .toEqual({ kind: "owned", bindingId: "binding-1", capabilityId: "expressive_tags" })
    expect(routeSelectionFromPart({ kind: "draft", ...routeFields } as ProjectPart))
      .toEqual({ kind: "owned", bindingId: "binding-1", capabilityId: "expressive_tags" })
  })

  it("reconnects a stale enrollment binding only to the same current provider route", () => {
    const part = {
      kind: "speech",
      voice_identity_id: "identity-1",
      binding_id: "retired-binding",
      provider: "alibaba",
      engine: "audio",
      model: "qwen-audio-3.0-tts-flash",
      capability_id: "expressive_tags",
    } as ProjectPart
    expect(replacementRouteSelectionFromPart(part, [ownedRoute])).toEqual({
      kind: "owned",
      bindingId: "binding-1",
      capabilityId: "expressive_tags",
    })
    expect(replacementRouteSelectionFromPart({ ...part, model: "another-model" } as ProjectPart, [ownedRoute])).toBeNull()
  })

  it("rehydrates Generate Again from the exact attached recording request", () => {
    const request = {
      text: "[whispers] Spoken for this recording",
      text_raw: "Canonical words",
      text_shaped: "Spoken for this recording",
      text_tagged: "[whispers] Spoken for this recording",
      text_state: "tagged",
    }
    const part = {
      id: 9,
      text: "Canonical words",
      text_state: "tagged",
      recording_text_state: "tagged",
      clip_id: 44,
      clip_raw_text: "Historical raw fallback",
      clip_spoken_text: "Historical spoken fallback",
      clip_tagged_text: "[old] Historical tagged fallback",
      speech_job: { result: { clip_id: 44 }, request },
    } as ProjectPart

    expect(creatorTextFromPart(part)).toEqual({
      raw: "Canonical words",
      shaped: "Spoken for this recording",
      tagged: "[whispers] Spoken for this recording",
      active: "tagged",
    })
  })

  it("ignores an obsolete Job request and falls back to immutable Clip truth", () => {
    const part = {
      id: 9,
      text: "Canonical words",
      recording_text_state: "shaped",
      clip_id: 44,
      clip_raw_text: "Clip original",
      clip_spoken_text: "Clip spoken",
      clip_tagged_text: "",
      speech_job: {
        result: { clip_id: 43 },
        request: { text: "Obsolete request", text_state: "raw" },
      },
    } as ProjectPart

    expect(creatorTextFromPart(part)).toEqual({
      raw: "Clip original",
      shaped: "Clip spoken",
      tagged: "",
      active: "shaped",
    })
  })
})
