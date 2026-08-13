import { describe, expect, it } from "vitest"

import { productionHealth } from "@/features/production/production-health-sheet"
import type { GeneratePayload, ProductionPart } from "@/types/domain"

function part(values: Partial<ProductionPart>): ProductionPart {
  return {
    id: 1,
    public_id: "part-1",
    created_at: "2026-08-12T00:00:00Z",
    position: 0,
    kind: "speech",
    text: "Canonical words",
    cost: 0,
    selected_take_id: 9,
    ...values,
  }
}

describe("productionHealth", () => {
  it("derives editorial, media and durable operation issues from server Parts", () => {
    const issues = productionHealth([
      part({ id: 1, selected_take_id: null }),
      part({ id: 2, missing: true }),
      part({ id: 3, outdated: true, subtitles_stale: true }),
      part({ id: 4, speech_job: {
        id: "job-4", type: "speech", status: "blocked", progress: 1,
        detail: "Review required", error: null, retries: 0,
        created_at: "2026-08-12T00:00:00Z", result: { ambiguous: true },
        request: {} as GeneratePayload,
      } }),
    ])

    expect(issues.map((issue) => issue.title)).toEqual([
      "Speech not recorded",
      "Missing media",
      "Recording outdated",
      "Captions need review",
      "Review required",
    ])
    expect(issues.map((issue) => issue.severity)).toEqual(["blocking", "blocking", "review", "review", "blocking"])
  })

  it("does not report non-speech Parts as unrecorded", () => {
    expect(productionHealth([
      part({ kind: "silence", selected_take_id: null }),
      part({ kind: "asset", selected_take_id: null }),
    ])).toEqual([])
  })
})
