import { afterEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import { jobObserver } from "@/lib/job-observer"
import type { CaptionMutationResult, DurableJob, ProductionPart } from "@/types/domain"

afterEach(() => { jobObserver.reset(); vi.restoreAllMocks() })

describe("Part caption Job API", () => {
  it("sends the active recording output language as transcription context", async () => {
    const queued: DurableJob<CaptionMutationResult> = { id: "caption-job", type: "transcribe", status: "queued", progress: 0, detail: "Queued", retries: 0, result: {} as CaptionMutationResult, part_id: 12 }
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({ data: queued }) })
    vi.stubGlobal("fetch", fetch)
    await studioApi.enqueueTranscribePart(8, { id: 12, filename: "take.mp3", language: "English" } as ProductionPart)
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({ file: "take.mp3", part_id: 12, production_id: 8, language: "English", confirmed: false })
  })

  it("allows an operator to correct genuinely unknown historical caption language", async () => {
    const queued: DurableJob<CaptionMutationResult> = { id: "caption-job", type: "transcribe", status: "queued", progress: 0, detail: "Queued", retries: 0, result: {} as CaptionMutationResult, part_id: 12 }
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({ data: queued }) })
    vi.stubGlobal("fetch", fetch)
    await studioApi.enqueueTranscribePart(8, { id: 12, filename: "historical.mp3" } as ProductionPart, false, "English")
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
    expect(body.language).toBe("English")
  })

  it("omits Auto so the caption provider can detect the spoken language", async () => {
    const queued: DurableJob<CaptionMutationResult> = { id: "caption-job", type: "transcribe", status: "queued", progress: 0, detail: "Queued", retries: 0, result: {} as CaptionMutationResult, part_id: 12 }
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({ data: queued }) })
    vi.stubGlobal("fetch", fetch)

    await studioApi.enqueueTranscribePart(8, { id: 12, filename: "take.mp3", language: "Auto" } as ProductionPart)

    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
    expect(body).not.toHaveProperty("language")
  })
})
