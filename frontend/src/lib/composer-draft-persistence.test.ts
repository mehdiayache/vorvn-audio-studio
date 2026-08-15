import { describe, expect, it } from "vitest"

import { contextWire, draftFromWire, draftWire, meaningfulDraft } from "./composer-draft-persistence"
import type { RecoverableCompositionDraft } from "./composer-contract"

function draft(): RecoverableCompositionDraft {
  return {
    voiceIdentityId: "voice-1",
    route: { kind: "owned", bindingId: "binding-1", capabilityId: null },
    text: { raw: "Hello", shaped: "", tagged: "", active: "raw" },
    textPreparation: { tagDensity: "normal", pendingReview: null },
    delivery: { modeId: "exact", instruction: "", rate: 1, pitch: 1, volume: 50, seed: 0 },
    output: { format: "mp3", language: "English" },
  }
}

describe("Composer Draft persistence", () => {
  it("round-trips the exact route and preparation fields", () => {
    const original = draft()
    original.textPreparation = { tagDensity: "heavy", pendingReview: { jobId: "11111111-1111-4111-8111-111111111111", kind: "tag" } }
    const restored = draftFromWire({ id: "draft-1", state: draftWire(original), version: 3, updated_at: "now" })
    expect(restored.state).toEqual(original)
    expect(restored.version).toBe(3)
  })

  it("keeps standalone and insertion contexts explicit", () => {
    expect(contextWire({ kind: "standalone" })).toEqual({ kind: "standalone" })
    expect(contextWire({ kind: "production", productionId: 6, insertion: { kind: "before_part", partId: "part-public" } })).toEqual({
      kind: "production", production_id: 6, part_id: null, insert_before_part_id: "part-public",
    })
  })

  it("does not persist a pristine Composer", () => {
    const empty = draft()
    empty.voiceIdentityId = null; empty.route = null; empty.text.raw = ""; empty.output.language = "Auto"
    empty.delivery.modeId = null
    expect(meaningfulDraft(empty)).toBe(false)
    expect(meaningfulDraft(draft())).toBe(true)
  })
})
