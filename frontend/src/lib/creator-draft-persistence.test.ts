import { describe, expect, it } from "vitest"

import { contextWire, draftFromWire, draftWire, meaningfulDraft } from "./creator-draft-persistence"
import type { RecoverableCompositionDraft } from "./creator-contract"

function draft(): RecoverableCompositionDraft {
  return {
    authoredRole: "Narrator",
    voiceIdentityId: "voice-1",
    route: { kind: "owned", bindingId: "binding-1", capabilityId: null },
    text: { raw: "Hello", shaped: "", tagged: "", active: "raw" },
    textPreparation: { tagDensity: "normal", spokenProfile: "spoken_1", pendingReview: null },
    delivery: { modeId: "exact", instruction: "", rate: 1, pitch: 1, volume: 100, seed: 0, enableSsml: false },
    output: { format: "mp3", language: "English" },
  }
}

describe("Creator Draft persistence", () => {
  it("round-trips the exact route and preparation fields", () => {
    const original = draft()
    original.textPreparation = { tagDensity: "heavy", spokenProfile: "spoken_2", pendingReview: { jobId: "11111111-1111-4111-8111-111111111111", kind: "shape", spokenProfile: "spoken_2" } }
    const restored = draftFromWire({ id: "draft-1", state: draftWire(original), version: 3, updated_at: "now" })
    expect(restored.state).toEqual(original)
    expect(restored.version).toBe(3)
  })

  it("keeps standalone and insertion contexts explicit", () => {
    expect(contextWire({ kind: "standalone" })).toEqual({ kind: "standalone" })
    expect(contextWire({ kind: "project", projectId: 6, insertion: { kind: "before_part", partId: "part-public" } })).toEqual({
      kind: "project", project_id: 6, part_id: null, insert_before_part_id: "part-public",
    })
  })

  it("does not persist a pristine Creator", () => {
    const empty = draft()
    empty.authoredRole = ""; empty.voiceIdentityId = null; empty.route = null; empty.text.raw = ""; empty.output.language = "Auto"
    empty.delivery.modeId = null
    expect(meaningfulDraft(empty)).toBe(false)
    expect(meaningfulDraft(draft())).toBe(true)
  })
})
