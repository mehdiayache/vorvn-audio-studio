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
    clip_id: 9,
    ...values,
  }
}

describe("productionHealth", () => {
  it("does not block release for Parts explicitly excluded from output", () => {
    expect(productionHealth([
      part({ id: 9, kind: "draft", enabled: false }),
      part({ id: 10, kind: "speech", missing: true, enabled: false }),
    ])).toEqual([])
  })

  it("treats active Drafts as planned work instead of release failures", () => {
    expect(productionHealth([
      part({ id: 9, kind: "draft", clip_id: null, enabled: true }),
    ])).toEqual([])
  })

  it("derives editorial, media and durable operation issues from server Parts", () => {
    const issues = productionHealth([
      part({ id: 1, clip_id: null }),
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
      "Speech recording missing",
      "Missing media",
      "Recording outdated",
      "Captions need review",
      "Review required",
    ])
    expect(issues.map((issue) => issue.severity)).toEqual(["blocking", "blocking", "review", "review", "blocking"])
  })

  it("does not report non-speech Parts as unrecorded", () => {
    expect(productionHealth([
      part({ kind: "silence", clip_id: null }),
      part({ kind: "asset", clip_id: null }),
    ])).toEqual([])
  })
})
