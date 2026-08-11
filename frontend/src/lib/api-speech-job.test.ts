import { afterEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import { jobObserver } from "@/lib/job-observer"
import type { DurableJob, GeneratePayload, GenerateResult } from "@/types/domain"

const payload: GeneratePayload = {
  text: "Immediate durable handle", insert_at: null, voice: "provider-voice",
  binding_id: "binding-1", engine: "audio", model: "flash", format: "mp3",
  language: "English", instruction: "", speech_mode: "exact", rate: 1,
  pitch: 1, volume: 50, seed: 0,
}

afterEach(() => { jobObserver.reset(); vi.restoreAllMocks(); vi.useRealTimers() })

describe("speech Job API", () => {
  it("returns and registers the queued backend Job without waiting for completion", async () => {
    vi.useFakeTimers()
    const queued: DurableJob<GenerateResult> = { id: "job-from-api", type: "speech", status: "queued", progress: 0, detail: "Queued", retries: 0, result: {}, part_id: 127 }
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({ data: queued }) })
    vi.stubGlobal("fetch", fetch)
    const returned = await studioApi.enqueueGenerate(payload)
    expect(returned).toEqual(queued)
    expect(returned.part_id).toBe(127)
    expect(jobObserver.getSnapshot("job-from-api")).toEqual(queued)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
